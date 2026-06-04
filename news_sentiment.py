import os
import numpy as np
from ddgs import DDGS
import trafilatura
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch


class NewsSentiment:

    DOMAINS = [
        "cnbcindonesia",
        "kontan",
        "bisnis",
        "investor",
        "idxchannel"
    ]

    def __init__(self):
        # Menggunakan model yang sudah di-finetune untuk sentimen
        self.model_name = "mdhugol/indonesia-bert-sentiment-classification" 
        
        # Inisialisasi Tokenizer dan Model BERT
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, num_labels=3)
        
        # Label pemetaan dari output model BERT
        self.labels = {0: "Negative", 1: "Neutral", 2: "Positive"}

    def get_news(self, company):
        links = []
        query = f"saham {company}"
        with DDGS() as ddgs:
            # FILTER WAKTU: timelimit="w" (berita 1 minggu terakhir)
            # Jika ingin 1 bulan, ganti menjadi timelimit="m"
            results = ddgs.text(query, region="id-id", timelimit="w", max_results=20)
            
            for r in results:
                url = r.get("href", "")
                if any(d in url for d in self.DOMAINS):
                    links.append(url)
                    
        return list(set(links))

    def scrape(self, urls):
        contents = []
        for url in urls[:10]:
            downloaded = trafilatura.fetch_url(url)
            if not downloaded:
                continue
                
            text = trafilatura.extract(downloaded)
            if text:
                # FILTER TEKS: Pecah per baris, buang teks pendek (menu/navigasi)
                # Syarat minimal panjang kata per paragraf adalah 10 kata
                paragraphs = [p.strip() for p in text.split('\n') if len(p.split()) > 10]
                
                # Hanya ambil 3 paragraf pertama (Lead Paragraph) yang padat informasi
                # Ini memastikan BERT tidak membaca footer atau iklan
                clean_lead_text = " ".join(paragraphs[:3])
                
                if len(clean_lead_text) > 100:
                    contents.append(clean_lead_text)
                    
        return contents

    def sentiment(self, company, texts):
        if not texts:
            return {
                "sentiment": "Neutral",
                "score": 0.0,
                "buy_hold_sell": "HOLD",
                "summary": "Tidak ada data teks berita baru dalam 1 minggu terakhir untuk dianalisis."
            }

        scores_list = []
        labels_list = []

        # Batasi analisis pada 5 berita teratas
        for text in texts[:5]:
            # Tokenisasi dengan batas maksimal 512 token
            inputs = self.tokenizer(
                text, 
                return_tensors="pt", 
                truncation=True, 
                max_length=512, 
                padding=True
            )
            
            with torch.no_grad():
                outputs = self.model(**inputs)
                
            probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1).numpy()[0]
            pred_label_idx = np.argmax(probabilities)
            
            scores_list.append(probabilities[pred_label_idx])
            labels_list.append(pred_label_idx)

        # Agregasi Hasil
        avg_score = float(np.mean(scores_list))
        final_label_idx = int(round(np.mean(labels_list))) 
        final_sentiment = self.labels[final_label_idx]

        # Tentukan Sinyal Transaksi
        if final_sentiment == "Positive":
            signal = "BUY"
            summary_text = f"Analisis berbasis BERT menunjukkan sentimen positif yang dominan terhadap saham {company} dari akumulasi berita 1 minggu terakhir."
        elif final_sentiment == "Negative":
            signal = "SELL"
            summary_text = f"Analisis berbasis BERT mendeteksi adanya sentimen negatif atau risiko pasar yang signifikan pada berita terkait saham {company} dalam 1 minggu terakhir."
        else:
            signal = "HOLD"
            summary_text = f"Sentimen pasar terpantau stabil dan cenderung netral untuk saham {company} berdasarkan pemberitaan media minggu ini."

        return {
            "sentiment": final_sentiment,
            "score": round(avg_score, 2),
            "buy_hold_sell": signal,
            "summary": summary_text
        }