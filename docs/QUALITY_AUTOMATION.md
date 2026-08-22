# Automatyzacja jakości i bezpieczeństwa

Niumpi ma publicznie udokumentowany, automatyczny pipeline CI/DevSecOps. Jego
zadaniem jest wychwytywanie błędów zanim zmiana zostanie uznana za bezpieczną do
połączenia z główną gałęzią.

W tym dokumencie słowo **ciągły** oznacza, że kontrole uruchamiają się
automatycznie po każdej zmianie kodu oraz według ustalonych harmonogramów. Nie
oznacza ono procesu, który odpytuje repozytorium bez przerwy co sekundę.

## Co uruchamia się automatycznie

| Mechanizm | Kiedy | Zakres |
|---|---|---|
| GitHub Actions CI | Każdy push do `main`, każdy pull request do `main`, uruchomienie ręczne | `npm ci`, ESLint, TypeScript, testy źródłowe, produkcyjny build oraz testy Playwright w Chromium. |
| Playwright | W ramach CI | Uruchomienie aplikacji, błędy przeglądarki, zapis i odczyt stanu, interakcja z Niumpi, sterowanie dźwiękiem/lampą/snem, karmienie metodą drag and drop oraz widok mobilny bez poziomego overflow. |
| CodeQL | Push, pull request, harmonogram tygodniowy i ręczne uruchomienie | Statyczna analiza bezpieczeństwa JavaScriptu i TypeScriptu z rozszerzonym zestawem zapytań. |
| Dependabot | Co tydzień | Aktualizacje zależności npm oraz używanych GitHub Actions w oddzielnych, kontrolowanych pull requestach. |

## Dowody po awarii

Testy przeglądarkowe działają bez automatycznych ponowień. Pierwsza nieudana
próba nie jest maskowana przez szczęśliwe drugie podejście.

Przy błędzie Playwright zachowuje:

- raport HTML;
- trace pozwalający odtworzyć każdy krok;
- screenshot;
- nagranie wideo.

Raport jest przesyłany jako artifact GitHub Actions. CodeQL zapisuje wykryte
problemy w sekcji Security/Code scanning, a pozostałe etapy pozostawiają pełne
logi wykonania.

## Co zielony pipeline naprawdę oznacza

Zielony wynik potwierdza, że w sprawdzonym commicie:

- kod przechodzi lint;
- TypeScript nie zgłasza błędów typów;
- testy źródłowe przechodzą;
- aplikacja daje się zbudować produkcyjnie;
- skompilowana aplikacja działa w Chromium dla sprawdzonych scenariuszy;
- CodeQL nie wykrył problemu objętego jego regułami.

Nie jest to dowód, że każda przyszła funkcja gry została przetestowana, że
każdy możliwy browser zachowa się identycznie ani że projekt jest absolutnie
wolny od błędów. Zakres jest rozszerzany razem z grą.

## Uruchomienie lokalne

Podstawowe sprawdzenia:

```bash
npm ci
npm run ci
```

Pełne testy przeglądarkowe:

```bash
npx playwright install chromium
npm run test:e2e
```

Tryb interaktywny:

```bash
npm run test:e2e:ui
```

## Wartość portfolio i CV

Konfiguracje workflow, testy, raportowanie błędów i polityka aktualizacji
zależności znajdują się w publicznym repozytorium. Rekruter może więc sprawdzić
nie tylko deklarację w CV, ale również faktyczne pliki i wyniki Actions.

Przykładowe sformułowanie po polsku:

> Zaprojektowałem i wdrożyłem automatyczny pipeline CI/DevSecOps dla aplikacji
> React/TypeScript, obejmujący GitHub Actions, ESLint, statyczną kontrolę typów,
> testy jednostkowe, produkcyjny build, testy E2E Playwright, CodeQL SAST,
> raporty diagnostyczne oraz aktualizacje zależności przez Dependabot.

Przykładowe sformułowanie po angielsku:

> Designed and implemented a CI/DevSecOps pipeline for a React/TypeScript
> application using GitHub Actions, ESLint, static type checking, unit and
> Playwright E2E tests, production-build validation, CodeQL SAST, diagnostic
> artifacts and Dependabot-managed dependency updates.

Na rozmowie można rozwinąć to o konkretny przykład: niestabilne testy interakcji
z animowaną postacią zostały wykryte przez pierwsze uruchomienia CI, następnie
przepisane tak, aby czekały na gotowy zapis stanu, używały stabilnych locatorów
i działały bez retry ukrywającego prawdziwą awarię.
