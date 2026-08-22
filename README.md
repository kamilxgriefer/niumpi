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
npm run build
npm run lint
```

## Pierwszy prototyp

Aktualna wersja zawiera młodego Niumpiego z jednym listkiem. Można go kliknąć, przytrzymać lub głaskać przeciągnięciem. Kontakt zmienia jego reakcję i poziom więzi.

## Tożsamość i więź

Przy pierwszym uruchomieniu gracz nadaje Niumpiemu imię, krótkie hasło nastroju oraz jeden z trzech charakterów: `Energetic`, `Chill` lub `Curious`. Charakter wpływa na to, jakie spontaniczne zachowania pojawiają się najczęściej.

Karta „My Buddy" pod stworkiem pokazuje imię, hasło, status relacji, dzień ostatniej opieki oraz ulubiony gest. Profil można zmienić w dowolnym momencie przyciskiem ołówka — nic z dotychczasowej opieki nie ginie.

Stan zapisywany jest lokalnie pod kluczem `niumpi-memory-v3`; starsze zapisy (`v2`, `v1`) są wczytywane automatycznie.
