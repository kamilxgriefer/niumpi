# Niumpi

[![CI](https://github.com/kamilxgriefer/niumpi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamilxgriefer/niumpi/actions/workflows/ci.yml)
[![CodeQL](https://github.com/kamilxgriefer/niumpi/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/kamilxgriefer/niumpi/actions/workflows/codeql.yml)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)](https://github.com/kamilxgriefer/niumpi/tree/main/tests/e2e)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/kamilxgriefer/niumpi/network/updates)

Niumpi to rozwijana gra o opiece nad wirtualnym stworzonkiem. Zachowanie,
reakcje i przyszły rozwój postaci mają zależeć od sposobu, w jaki gracz ją
karmi, dotyka, uspokaja i spędza z nią czas.

Projekt jest niezależny od YO Voice.

## Stos technologiczny

- TypeScript, React 19 i vinext/Vite;
- CSS oraz warstwowe animacje postaci;
- Playwright do rzeczywistych testów przeglądarkowych;
- GitHub Actions, CodeQL i Dependabot do automatycznej kontroli jakości,
  bezpieczeństwa oraz zależności.

## Wymagania

- Node.js 22.13 lub nowszy;
- npm;
- Git;
- współczesna przeglądarka internetowa.

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

Playwright sprawdza obecnie uruchomienie gry, błędy przeglądarki, zapis stanu,
interakcje opieki, karmienie metodą drag and drop oraz działanie na wąskim
widoku mobilnym. Przy prawdziwym błędzie zachowuje raport HTML, trace,
screenshot i nagranie.

## Automatyczna kontrola projektu

Każdy push do `main` i każdy pull request do `main` automatycznie uruchamia:

- instalację zależności przez `npm ci`;
- ESLint;
- statyczną kontrolę TypeScriptu;
- testy jednostkowe/kontraktowe;
- produkcyjny build;
- testy Playwright w Chromium.

CodeQL analizuje kod JavaScript/TypeScript pod kątem podatności przy zmianach
oraz cyklicznie, a Dependabot co tydzień sprawdza zależności npm i używane
GitHub Actions.

„Automatyczna kontrola” oznacza uruchamianie sprawdzeń po każdej zmianie i
według harmonogramu — nie marketingowe twierdzenie, że jakiś robot patrzy na
repozytorium co sekundę. Wyniki są widoczne publicznie w zakładce Actions oraz
na odznakach na górze README.

Pełny opis, zakres dowodów i gotowe sformułowania do CV znajdują się w
[`docs/QUALITY_AUTOMATION.md`](docs/QUALITY_AUTOMATION.md).

## Pierwszy prototyp

Aktualna wersja zawiera młodego Niumpiego z jednym listkiem. Można go kliknąć,
przytrzymać lub głaskać przeciągnięciem. Kontakt zmienia jego reakcję, zapisuje
wspólne momenty i wpływa na poziom więzi.

## Autor

Projekt rozwija **Kamil Jaguszewski** (`kamilxgriefer`).

GitHub: [github.com/kamilxgriefer](https://github.com/kamilxgriefer)
