# Order Flow Assistant – Android PWA

Magyar nyelvű, mobilra optimalizált döntéstámogató alkalmazás SoloClash 25K Limitless Evaluation számlához.

## Beépített számlaprofil

- Kezdőegyenleg: 25 000 USD
- Profitcél: 1 500 USD
- EOD drawdown: 1 000 USD
- Maximum: 3 E-mini egyenérték
- Belső napi stop: 300 USD (módosítható)
- Maximum 3 trade/nap (módosítható)
- Minimum R:R: 1,5 (módosítható)
- Maximum kockázat/trade: 250 USD (módosítható)

A profil a Beállítások oldalon bármikor módosítható.

## Instrumentumok

6E, 6J, ES, MES, NQ, MNQ, MGC. Az alkalmazás tickalapú kockázatot számol. A mikro kontraktusok E-mini egyenértéke alapértelmezésben 0,1.

## Telepítés Androidra

A PWA telepítéséhez HTTPS-en kell megnyitni. A legegyszerűbb megoldás:

1. Tömörítsd ki a csomagot.
2. Töltsd fel a teljes mappát egy statikus tárhelyre, például GitHub Pages, Netlify vagy Cloudflare Pages szolgáltatásba.
3. Nyisd meg a kapott HTTPS-címet Androidon Chrome-ban.
4. Válaszd a „Telepítés” gombot, vagy a Chrome menüben az „Alkalmazás telepítése / Hozzáadás a kezdőképernyőhöz” lehetőséget.
5. Ezután saját ikonról, teljes képernyőn fut, és az alapfunkciók offline is használhatók.

## Helyi teszt számítógépen

A mappában indíts egy helyi szervert:

```bash
python -m http.server 8080
```

Majd nyisd meg: `http://localhost:8080`

## Adatok

A napló, képek és beállítások a böngésző helyi tárhelyén maradnak. Használd rendszeresen az Export JSON funkciót biztonsági mentéshez.

## Korlát

Ez döntéstámogató eszköz, nem kereskedési jelzés és nem garantál nyereséget. Számlaváltáskor a hivatalos prop szabályok alapján frissítsd a profilt.
