# Niumpi

A cozy virtual pet that grows with you.

> Niumpi remembers you, develops a real personality and evolves through the way you care for it.

Projekt jest niezależny od YoVoice.

## Wymagania

- Node.js 22.13 lub nowszy
- npm
- współczesna przeglądarka

## Uruchomienie

```bash
npm install
```

```bash
npm run dev
```

Gra działa pod `http://localhost:3000` (przy zajętym porcie vinext wybiera kolejny wolny).

## Kontrola jakości

```bash
npm run lint
```

```bash
npm test
```

`npm test` buduje projekt i uruchamia wszystkie pliki `tests/*.test.mts`:
zasady gry (`gameRules`), tożsamość i więź (`gameLogic`) oraz renderowany
serwerowo ekran (`rendered-html`).

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

Zasada nadrzędna: **stan animacji jest oddzielony od zapisanego stanu gry**, a React
nigdy nie aktualizuje stanu w rytmie klatek. Jedyna pętla `requestAnimationFrame`
w interfejsie należy do `NiumpiAnimationController`, który zapisuje wartości
bezpośrednio do zmiennych CSS. Phaser prowadzi własną pętlę wewnątrz canvasu i
komunikuje się z Reactem wyłącznie zdarzeniami punktowymi (punkty, koniec rundy).

### Postać

W repozytorium nie ma pliku `.riv`, więc zamiast Rive postać jest złożona z
warstw: `layer-body` (bazowy asset), `layer-tint` i `layer-marking` maskowane
sylwetką ciała, twarz, listki, ręce, aura i cząsteczki. Dzięki temu dieta i
ścieżka ewolucji naprawdę zmieniają wygląd, bez podmiany obrazka.

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

## Tryb developerski

`?dev=1` (tylko poza produkcją) włącza panel z mnożnikiem czasu, symulacją dni,
ustawianiem etapu, wymuszaniem ewolucji, podglądem wektorów i resetem zapisu.
