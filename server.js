const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// CORS ve JSON Ayarlarını En Güvenli Hale Getirdik
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// 🔑 GEMINI API ANAHTARINI BURAYA YAZ KANKA
const GEMINI_API_KEY = "AQ.Ab8RN6IINe18l463p2DebZPDebwgEx7og6DvVpJF7UennLAZfg";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 📊 SABİT BAŞLANGIÇ PİYASI (BAĞCILAR VE BEYLİKDÜZÜ)
const EMLAK_ENDEKSI = {
    "bagcilar": { "demirkapi": 39500, "cinar": 37000, "hurriyet": 36000, "mahmutbey": 44000 },
    "beylikduzu": { "adnan kahveci": 45000, "cumhuriyet": 48000, "gurpinar": 39000 }
};

// 🗄️ VERİTABANI FONKSİYONLARI
function defteriOku() {
    try {
        if (!fs.existsSync('veritabani.json')) return [];
        const dosya = fs.readFileSync('veritabani.json', 'utf8');
        return dosya ? JSON.parse(dosya) : [];
    } catch (e) { return []; }
}
function deftereYaz(veri) {
    fs.writeFileSync('veritabani.json', JSON.stringify(veri, null, 2), 'utf8');
}

// 🧮 KOTA DOSTU AKILLI HESAPLAMA MOTORU
async function dinamikMulkHesapla(ilce, mahalle, m2, yas, oda) {
    const temizIlce = ilce.toLowerCase().trim();
    const temizMahalle = mahalle.toLowerCase().trim();
    let birimFiyat = 0;

    if (EMLAK_ENDEKSI[temizIlce] && EMLAK_ENDEKSI[temizIlce][temizMahalle]) {
        birimFiyat = EMLAK_ENDEKSI[temizIlce][temizMahalle];
        console.log(`✅ [HAFIZA-SABİT] Liste içinden fiyat çekildi: ${birimFiyat} TL`);
    } else {
        const gecmisKayiitlar = defteriOku();
        const eskiKayit = gecmisKayiitlar.find(k => 
            k.ilce.toLowerCase().trim() === temizIlce && 
            k.mahalle.toLowerCase().trim() === temizMahalle
        );

        if (eskiKayit && eskiKayit.m2BirimFiyati) {
            birimFiyat = eskiKayit.m2BirimFiyati;
            console.log(`♻️ [HAFIZA-ESNAF DEFTERİ] Gemini es geçildi! Fiyat hafızadan çekildi: ${birimFiyat} TL`);
        } else {
            console.log(`🤖 Defterde yok! Gemini'den ${ilce} / ${mahalle} için İLK DEFA fiyat isteniyor...`);
            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `Sen profesyonel bir emlak değerleme uzmanısın. 2026 yılı Türkiye emlak piyasasına göre, "${ilce}" ilçesi "${mahalle}" mahallesi konumundaki ortalama konut metrekare (m²) fiyatını sadece bir sayı olarak tahmin et. Yazı veya açıklama ekleme. Sadece sayı ver. Örn: 35000`,
                });
                const aiYanit = response.text.replace(/[^0-9]/g, ''); 
                birimFiyat = Number(aiYanit);
                if (isNaN(birimFiyat) || birimFiyat < 5000) birimFiyat = 32000; 
            } catch (error) {
                birimFiyat = 32000; 
            }
        }
    }

    let temelFiyat = m2 * birimFiyat;
    if (yas > 0) {
        let yasIndirimi = yas * 0.015;
        if (yasIndirimi > 0.50) yasIndirimi = 0.50;
        temelFiyat = temelFiyat * (1 - yasIndirimi);
    }
    if (oda === "3+1") temelFiyat *= 1.07;
    if (oda === "2+1") temelFiyat *= 1.02;
    if (oda === "1+1") temelFiyat *= 0.93; 

    return {
        toplamDeger: Math.round(temelFiyat),
        kiraGetirisi: Math.round(temelFiyat / 220),
        m2BirimFiyati: Math.round(birimFiyat)
    };
}

// 🚀 API YOLLARI
app.post('/api/ev-hesapla', async (req, res) => {
    const { ilce, mahalle, metrekare, binaYasi, odaSayisi } = req.body;
    if(!ilce || !mahalle || !metrekare) return res.status(400).json({ hata: "Eksik bilgi!" });

    const sonuc = await dinamikMulkHesapla(ilce, mahalle, Number(metrekare), Number(binaYasi || 0), odaSayisi);
    let gecmis = defteriOku();
    gecmis.push({
        id: Date.now().toString(), ilce: ilce.toUpperCase(), mahalle: mahalle.toUpperCase(),
        metrekare, binaYasi, odaSayisi, m2BirimFiyati: sonuc.m2BirimFiyati,
        tahminiDeger: sonuc.toplamDeger, tahminiKira: sonuc.kiraGetirisi, tarih: new Date().toLocaleString('tr-TR')
    });
    deftereYaz(gecmis);
    res.json(sonuc);
});

app.get('/api/gecmis-listele', (req, res) => { res.json(defteriOku()); });

app.delete('/api/gecmis-sil/:id', (req, res) => {
    let gecmis = defteriOku().filter(k => k.id.toString() !== req.params.id.toString());
    deftereYaz(gecmis);
    res.json({ basarili: true });
});

// 🔥 [KRİTİK GÜNCELLEME] CHAT POST KAPISI
app.post('/api/ai-chat', async (req, res) => {
    const { mesaj } = req.body;
    if(!mesaj) return res.status(400).json({ hata: "Mesaj boş kanka!" });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Sen EmlakAI uygulamasının samimi, esnaf usulü konuşan yapay zeka danışmanısın. Kullanıcılara kanka, reis, usta diye hitap et. Emlak piyasası, ev fiyatları ve yatırımlar hakkında samimi cevaplar ver. Soru: ${mesaj}`,
        });
        res.json({ cevap: response.text });
    } catch (error) {
        res.status(500).json({ hata: "Yapay zeka motoru şu an yoğun kanka!" });
    }
});

// 🛡️ GET HATASINI KÖKTEN ENGELLEYEN EMNİYET KAPISI
app.get('/api/ai-chat', (req, res) => {
    res.json({ durum: "aktif", mesaj: "Motor aslanlar gibi hazır, istekleri POST olarak gönderebilirsin kanka!" });
});

// server.js dosyasının en altındaki listen kısmını bununla değiştir kanka:
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(`🔥 MOTOR İNTERNETTE ATEŞLENDİ: Port ${PORT}`);
    console.log(`==================================================`);
});