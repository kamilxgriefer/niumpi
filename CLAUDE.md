# Pamięć projektu Niumpi

## Zakres

- Pracujemy wyłącznie nad repozytorium Niumpi.
- Nie modyfikujemy projektów YoVoice.
- Szczegóły projektu: `memory/projects/niumpi.md`.

## Produkt

| Element | Ustalenie |
|---|---|
| Niumpi | Przyjazny wirtualny pupil dla wszystkich grup wiekowych, szczególnie najmłodszych |
| Platforma MVP | Gra webowa projektowana najpierw pod telefon i dotyk |
| Rdzeń zabawy | Sam kontakt z Niumpim ma być rozrywką: klikanie, głaskanie, przytrzymywanie i odkrywanie reakcji |
| Dojrzałość | Stopniowo wyrastają dwie symetryczne ręce |
| Więź | Liczba lewitujących listków rośnie: 1 → 2 → 3 → 5 |
| Osobowość | Kształt, kolor, ruch i wzory listków zapamiętują sposób opieki |
| Bezpieczeństwo | Niumpi nie umiera; brak kar za nieobecność i błędne gesty |

## Kolejność budowy

1. Grywalny ekran z żywym Niumpim.
2. Dotyk: kliknięcie, głaskanie i przytrzymanie.
3. Mimika, ruch, listki i dźwięki reagujące na gracza.
4. Potrzeby: sytość, energia, radość i więź.
5. Lokalny zapis oraz odtworzenie stanu.
6. Test intuicyjności z dziećmi i opiekunami.
7. Dopiero później: karmienie, sen, pokój, ewolucja, minigry i dalsza zawartość.

## Zasada prowadząca

Najpierw dopracowujemy przyjemność przebywania z Niumpim. Nie rozbudowujemy systemów, dopóki dotykanie i obserwowanie stworzenia nie daje frajdy.

## Git workflow i chroniony `main`

- Nigdy nie wypychaj zmian bezpośrednio do `main`.
- Pracuj na małej, tematycznej gałęzi i otwieraj pull request do `main`.
- Scalaj dopiero po pomyślnym zakończeniu kontroli `Lint, types, tests and build`, `Playwright (Chromium)` oraz `Analyze JavaScript and TypeScript`.
- Używaj wyłącznie squash merge, aby historia `main` pozostawała liniowa i czytelna.
- To repozytorium rozwija jedna osoba, dlatego ruleset nie wymaga formalnej aprobaty drugiej osoby; nierozwiązane wątki przeglądu nadal blokują scalenie.
- Nie omijaj wymaganych kontroli, nie używaj force push i nie usuwaj gałęzi `main`.
- Kanoniczny, importowalny ruleset znajduje się w `.github/rulesets/main-protection.json`. Faktycznym źródłem egzekwowania pozostają ustawienia GitHub, gdzie ruleset musi mieć status **Active**.
