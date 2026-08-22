# Niumpi

Prosta gra o opiece nad wirtualnym stworzonkiem.

Projekt jest niezależny od YoVoice.

## Wymagania

- Node.js 22.13 lub nowszy
- npm
- Git
- współczesna przeglądarka internetowa

## Uruchomienie lokalne

```bash
npm ci
npm run dev
```

Gra będzie dostępna pod adresem `http://localhost:3000`.

## Kontrola jakości

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Skrót uruchamiający podstawowy zestaw kontroli:

```bash
npm run ci
```

## Testy przeglądarkowe Playwright

Przy pierwszym uruchomieniu pobierz Chromium używane przez testy:

```bash
npx playwright install chromium
```

Następnie uruchom testy:

```bash
npm run test:e2e
```

Dodatkowe tryby:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

Raport HTML po teście znajduje się w katalogu `playwright-report`.

## Automatyzacja GitHub

Repozytorium używa:

- GitHub Actions CI do lintowania, sprawdzania TypeScriptu, testów, buildu i testów Playwright;
- CodeQL do analizy bezpieczeństwa kodu JavaScript i TypeScript;
- Dependabot do cotygodniowych aktualizacji zależności npm oraz GitHub Actions.

## Pierwszy prototyp

Aktualna wersja zawiera młodego Niumpiego z jednym listkiem. Można go kliknąć, przytrzymać lub głaskać przeciągnięciem. Kontakt zmienia jego reakcję i poziom więzi.
