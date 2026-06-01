import os
import numpy as np
from ddgs import DDGS
import trafilatura
# Ganti Google Generative AI dengan Hugging Face Transformers
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
        # Menggunakan model BERT Bahasa Indonesia khusus finansial/sentimen
        # Contoh: "indobenchmark/indobert-base-p2" atau model fine-tuned finansial pasar modal
        self.model_name = "indobenchmark/indobert-base-p2" 
        
        # Inisialisasi Tokenizer dan Model BERT
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, num_labels=3)
        
        # Label pemetaan dari output model BERT (biasanya tergantung konfigurasi model target)
        self.labels = {0: "Negative", 1: "Neutral", 2: "Positive"}

    def get_news(self, company):
        links = []
        query = f"saham {company}"
        with DDGS() as ddgs:
            results = ddgs.text(query, region="id-id", max_results=20)
            for r in results:
                url = r["href"]
                if any(d in url for d in self.DOMAINS):
                    links.append(url)
        return list(set(links))

    def scrape(self, urls):
        contents = []
        for url in urls[:10]:
            downloaded = trafilatura.fetch_url(url)
            text = trafilatura.extract(downloaded)
            if text and len(text) > 300:
                contents.append(text)
        return contents

    def sentiment(self, company, texts):
        if not texts:
            return {
                "sentiment": "Neutral",
                "score": 0.0,
                "buy_hold_sell": "HOLD",
                "summary": "Tidak ada data teks berita untuk dianalisis."
            }

        scores_list = []
        labels_list = []

        # Batasi analisis pada beberapa berita teratas untuk efisiensi komputasi lokal
        for text in texts[:5]:
            # BERT memiliki token limit (biasanya 512 token). 
            # Kita lakukan tokenisasi dan pemotongan otomatis (truncation)
            inputs = self.tokenizer(
                text, 
                return_tensors="pt", 
                truncation=True, 
                max_length=512, 
                padding=True
            )
            
            # Jalankan inferensi tanpa menghitung gradien (mode evaluasi)
            with torch.no_grad():
                outputs = self.model(**inputs)
                
            # Ambil nilai logit dan ubah ke probabilitas menggunakan Softmax
            probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1).numpy()[0]
            
            # Ambil index dengan probabilitas tertinggi
            pred_label_idx = np.argmax(probabilities)
            
            # Simpan skor probabilitas tertinggi dan labelnya
            scores_list.append(probabilities[pred_label_idx])
            labels_list.append(pred_label_idx)

        # Agregasi Hasil Akhir dari Semua Berita
        avg_score = float(np.mean(scores_list))
        final_label_idx = int(round(np.mean(labels_list))) # Ambil nilai tengah/modus atau rata-rata bulatan
        final_sentiment = self.labels[final_label_idx]

        # Tentukan Sinyal Transaksi Berdasarkan Sentimen Dominan BERT
        if final_sentiment == "Positive":
            signal = "BUY"
            summary_text = f"Analisis berbasis BERT menunjukkan sentimen positif yang dominan terhadap saham {company} dari akumulasi berita terbaru."
        elif final_sentiment == "Negative":
            signal = "SELL"
            summary_text = f"Analisis berbasis BERT mendeteksi adanya sentimen negatif atau risiko pasar yang signifikan pada berita terkait saham {company}."
        else:
            signal = "HOLD"
            summary_text = f"Sentimen pasar terpantau stabil dan cenderung netral untuk saham {company} berdasarkan pemberitaan media saat ini."

        # Kembalikan struktur dictionary yang strukturnya SAMA PERSIS dengan output LLM sebelumnya
        return {
            "sentiment": final_sentiment,
            "score": round(avg_score, 2),
            "buy_hold_sell": signal,
            "summary": summary_text
        }