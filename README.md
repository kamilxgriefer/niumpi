# Niumpi

Prosta gra o opiece nad wirtualnym stworzonkiem.

Projekt jest niezależny od YoVoice.

## Wymagania

- Node.js 22.13 lub nowszy (docelowo stabilna wersja LTS)
- npm
- Git
- współczesna przeglądarka internetowa

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Gra będzie dostępna pod adresem `http://localhost:3000`.

## Kontrola jakości

```bash
npm run lint
```

```bash
npm test
```

`npm test` buduje projekt, a następnie uruchamia testy logiki gry (`tests/gameLogic.test.mts`) oraz testy renderowanego ekranu (`tests/rendered-html.test.mjs`).

## Pierwszy prototyp

Aktualna wersja zawiera młodego Niumpiego z jednym listkiem. Można go kliknąć, przytrzymać lub głaskać przeciągnięciem. Kontakt zmienia jego reakcję i poziom więzi.

## Tożsamość i więź

Przy pierwszym uruchomieniu gracz nadaje Niumpiemu imię, krótkie hasło nastroju oraz jeden z trzech charakterów: `Energetic`, `Chill` lub `Curious`. Charakter wpływa na to, jakie spontaniczne zachowania pojawiają się najczęściej.

Karta „My Buddy" pod stworkiem pokazuje imię, hasło, status relacji, dzień ostatniej opieki oraz ulubiony gest. Profil można zmienić w dowolnym momencie przyciskiem ołówka — nic z dotychczasowej opieki nie ginie.

Stan zapisywany jest lokalnie pod kluczem `niumpi-memory-v3`; starsze zapisy (`v2`, `v1`) są wczytywane automatycznie.

## Interfejs

Cały ekran mieści się w jednym panelu aplikacji (maks. 1180 px) na pastelowym gradiencie. Kolejność sekcji: nagłówek z więzią, scena z Niumpim, karta towarzysza, etap rozwoju, banner osobowości, podpowiedź interakcji, snack bar i przyciski pokoju.

Scena jest jedynym elementem reagującym na porę dnia — rano, wieczorem i w nocy zmienia się tło pokoju oraz dekoracyjne okno. Reszta interfejsu zostaje ciepła i jasna.

Style opierają się na tokenach zdefiniowanych w `:root` (kolory, odstępy, promienie, cienie, skala typografii i czasy animacji). Postać skaluje się przez `container-type: size`, więc listki i unoszenie zachowują proporcje na każdej szerokości ekranu.

Layout ma trzy warianty: trzy kolumny na desktopie, Niumpi nad dymkiem i statystykami na tablecie oraz jedna kolumna na telefonie (od 320 px, bez przewijania w poziomie).

## Karmienie

Przysmak można przeciągnąć na Niumpiego albo dotknąć go raz, żeby go wybrać, a następnie dotknąć Niumpiego. Wybrany przysmak działa też z klawiatury. Liczba przy przysmaku pokazuje, ile razy Niumpi już go dostał — gra nie ma ograniczonego ekwipunku.
