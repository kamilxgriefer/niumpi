# Niumpi

[![CI](https://github.com/kamilxgriefer/niumpi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kamilxgriefer/niumpi/actions/workflows/ci.yml)
[![CodeQL](https://github.com/kamilxgriefer/niumpi/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/kamilxgriefer/niumpi/actions/workflows/codeql.yml)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)](https://github.com/kamilxgriefer/niumpi/tree/main/tests/e2e)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/kamilxgriefer/niumpi/network/updates)

A cozy virtual pet that grows with you.

> Niumpi remembers you, develops a real personality and evolves through the way
> you care for it.

Niumpi to gra o opiece nad wirtualnym stworzonkiem. Zachowanie, reakcje i
przyszły rozwój postaci zależą od tego, jak gracz ją karmi, dotyka, uspokaja i
spędza z nią czas.

Projekt jest niezależny od YO Voice.

## Stos technologiczny

- TypeScript, React 19 i vinext/Vite;
- czysty TypeScript (bez Reacta) dla reguł gry, zapisu i ewolucji;
- CSS oraz warstwowe animacje postaci;
- Framer Motion (`motion`) dla przejść interfejsu;
- Phaser 4 dla minigier z pętlą klatek, ładowany leniwie;
- Web Audio API dla dźwięku;
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

`npm run test:unit` najpierw buduje projekt, ponieważ test kontraktu
renderowanego serwerowo sprawdza rzeczywisty wynik produkcyjny, a nie kod
źródłowy.

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

Playwright sprawdza uruchomienie gry bez błędów przeglądarki, zapis i odczyt
stanu, podstawową akcję opieki, karmienie, przejścia między scenami, brak
poziomego przewijania na wąskim widoku mobilnym oraz otwarcie minigry opartej na
Phaserze wraz z jej reakcją na wejście gracza. Przy prawdziwym błędzie zachowuje
raport HTML, trace, screenshot i nagranie.

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

## Architektura

Każda warstwa używa technologii właściwej dla swojego zadania.

| Warstwa | Technologia | Gdzie |
|---|---|---|
| Reguły gry, stan, zapis, ewolucja | czysty TypeScript, bez Reacta | `app/game/**` |
| Animacja postaci | dedykowany kontroler + rAF + CSS | `app/anim/**`, `app/styles/rig.css` |
| Ciągłe efekty (oddech, mruganie, blask) | CSS keyframes | `app/styles/**` |
| Przejścia UI, modale, karty, drag | Framer Motion (`motion`) | `app/ui/**`, `app/scenes/**` |
| Minigry z pętlą klatek i kolizjami | Phaser 4, ładowany leniwie | `app/minigames/phaser/**` |
| Minigry turowe | DOM + React (pełna dostępność) | `app/minigames/*.tsx` |
| Dźwięk | Web Audio API, syntezowany | `app/ui/audio.ts` |

Zasada nadrzędna: **stan animacji jest oddzielony od zapisanego stanu gry**, a
React nigdy nie aktualizuje stanu w rytmie klatek. Jedyna pętla
`requestAnimationFrame` w interfejsie należy do `NiumpiAnimationController`,
który zapisuje wartości bezpośrednio do zmiennych CSS. Phaser prowadzi własną
pętlę wewnątrz canvasu i komunikuje się z Reactem wyłącznie zdarzeniami
punktowymi (punkty, koniec rundy).

### Postać

W repozytorium nie ma pliku `.riv`, więc zamiast Rive postać jest złożona z
warstw: bazowy asset, tint ścieżki ewolucji i wzory od diety maskowane sylwetką
ciała, twarz, listki, ręce, aura i cząsteczki. Dzięki temu dieta i ścieżka
ewolucji naprawdę zmieniają wygląd, bez podmiany obrazka.

### Sceny

Trwały `GameShell` (tło, boczny pasek, dolna nawigacja, warstwy nagród i
powiadomień) nie znika przy zmianie sceny. Sceny są rozdzielone na osobne paczki
i ładowane przy pierwszym wejściu. Adres aktualizuje się przez `?scene=…`, więc
działa przycisk wstecz i deep link.

## Zapis

Stan trzymany jest lokalnie pod kluczem `niumpi-save-v4`. Starsze zapisy
(`niumpi-memory-v3`, `v2`, `v1`) są migrowane: imię, więź, potrzeby i wszystkie
policzone interakcje stają się punktami opieki i startowymi wektorami ewolucji.

Zapis przechodzi przez interfejs `PersistenceAdapter`, więc adapter chmurowy
można dodać bez zmiany komponentów. Każda nagroda ma klucz `claims`, dlatego
odświeżenie strony w trakcie odbierania nagrody nie wypłaci jej dwa razy.

Czas liczony jest ze znaczników czasu, nie z licznika działającego w otwartej
karcie — rośliny rosną, sny się kończą, a wyprawy wracają także przy zamkniętej
grze. Po dwóch dobach nieobecności spadek statystyk przestaje być naliczany.

## Bezpieczeństwo i ton

- Niumpi nie choruje z samotności i nigdy nie znika.
- Brak kar za pominięty dzień, brak streaka do zerwania.
- Memory Seeds nie pytają o dane wrażliwe; odpowiedzi można zmienić lub usunąć.
- Brak lootboxów, brak losowych szans, każda cena jest jawna.

## Zgłaszanie podatności

Podejrzeń podatności nie należy publikować w zwykłym issue ani pull requeście.
Instrukcja prywatnego, odpowiedzialnego zgłoszenia znajduje się w
[`SECURITY.md`](SECURITY.md).

## Tryb developerski

`?dev=1` (tylko poza produkcją) włącza panel z mnożnikiem czasu, symulacją dni,
ustawianiem etapu, wymuszaniem ewolucji, podglądem wektorów i resetem zapisu.

## Autor

Projekt rozwija **Kamil Jaguszewski** (`kamilxgriefer`).

GitHub: [github.com/kamilxgriefer](https://github.com/kamilxgriefer)
