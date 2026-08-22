# Projekt Niumpi

**Status:** aktywny, etap fundamentów i prototypu  
**Repozytorium:** `/Users/kamil/Documents/GitHub/niumpi`  
**Cel:** prosta, przyjazna gra typu virtual pet dla wszystkich grup wiekowych, ze szczególnym uwzględnieniem najmłodszych.

## Obietnica produktu

Niumpi ma być żywą cyfrową zabawką. Gracz nie musi realizować zadań, aby dobrze się bawić — samo dotykanie, głaskanie i obserwowanie reakcji stworzenia stanowi pełnoprawną rozrywkę.

Robocza obietnica: „Dotknij Niumpiego. Zobacz, jak uczy się Ciebie.”

## Kanoniczny wygląd

- Koralowo-brzoskwiniowe, miękkie ciało przypominające żywą kroplę.
- Ciemne, ciepłe oczy i prosta, czytelna mimika.
- Turkusowe, świecące listki lewitujące nad głową.
- Kanoniczna plansza: `assets/concepts/arms-evolution.png`.
- Cztery etapy rozwoju.
- Niumpi rodzi się bez rąk; następnie wyrastają dwa symetryczne zalążki, krótkie ręce i dwie pełne ręce.
- Progresja listków: 1, 2, 3, 5.

## Znaczenie rozwoju

- **Ręce** oznaczają wiek, dojrzałość i rosnącą samodzielność.
- **Liczba listków** oznacza głębokość więzi z opiekunem.
- **Wygląd i zachowanie listków** zapisują dominujący sposób opieki.

Przykłady pamięci listków:

- dużo zabawy — sprężyste, energiczne,
- regularny sen — miękkie i świecące,
- odkrywanie — długie, ze wzorami,
- dużo czułości — układają się w gesty bliskości,
- chaotyczna, dobra relacja — asymetryczne i zabawne.

## Interakcje dotykowe

Pierwszy zestaw powinien obejmować:

- pojedyncze kliknięcie,
- szybkie klikanie,
- głaskanie przeciągnięciem,
- przytrzymanie palca,
- dotykanie różnych części ciała,
- dotykanie listków,
- spontaniczne i częściowo nieprzewidywalne reakcje.

Gesty nie mogą krzywdzić Niumpiego. Chaotyczne dotykanie przez małe dziecko ma wywoływać zdziwienie lub zabawę, nigdy cierpienie ani karę.

## Fundament MVP

1. Jeden młody Niumpi na jednej scenie.
2. Oddychanie, mruganie i śledzenie palca.
3. Około 8–10 dopracowanych reakcji dotykowych.
4. Cztery stany: sytość, energia, radość i więź.
5. Komunikowanie potrzeb przede wszystkim zachowaniem, nie liczbami.
6. Upływ czasu.
7. Lokalny zapis imienia, stanu, etapu rozwoju, listków, preferowanych gestów i stylu opieki.
8. Pierwszy zauważalny krok rozwoju relacji.

## Zasady bezpieczeństwa i tonu

- Niumpi nie umiera z powodu zaniedbania.
- Relację zawsze można odbudować.
- Brak presji codziennego logowania i kar za opuszczone dni.
- Brak straszących komunikatów.
- Projektowanie obsługi bez konieczności czytania instrukcji.
- Natychmiastowa reakcja na dotyk.
- Kontrola rodzicielska przed przyszłymi płatnościami lub działaniami zewnętrznymi.

## Plan realizacji

### Etap 1 — grywalny pionowy wycinek

- scena z Niumpim,
- oddychanie i mruganie,
- kliknięcie,
- głaskanie,
- przytrzymanie,
- reakcja listka,
- radość wpływająca na zachowanie,
- automatyczny zapis i odtworzenie.

### Etap 2 — walidacja

Dać prototyp dzieciom wraz z opiekunami bez tłumaczenia sterowania. Obserwować, czy próbują dotykać Niumpiego, rozumieją reakcje i chcą kontynuować zabawę.

### Etap 3 — rozszerzenie

Dopiero po potwierdzeniu atrakcyjności rdzenia dodać karmienie, sen, pokój, ewolucję rąk i listków, minigry oraz kolejne elementy świata.

## Aktualny stan prototypu

- Rig v1 z niezależną twarzą, oczami, powiekami, ustami, nóżkami i listkiem.
- Sprężynowy ruch, spontaniczne zachowania i śledzenie kursora podczas ciekawości.
- Trwała pamięć więzi i preferowanych gestów.
- Potrzeby: sytość, energia i radość, z łagodnym upływem czasu również poza grą.
- Pierwsze karmienie: Moonberry, Cloud puff i Dewdrop, przeciągane bezpośrednio do Niumpiego.
- Niumpi zapamiętuje liczbę zjedzonych pokarmów, a potrzeby wpływają na wybór zachowań.
- Rytm dnia dopasowany do lokalnej pory: dzień, wieczór i noc zmieniają atmosferę pokoju.
- Sen jest dobrowolny i bezpieczny: opcja „Tuck in”, spokojna animacja, własny dźwięk oraz łagodne budzenie dotykiem lub przyciskiem.
- Podczas snu energia regeneruje się w aktywnej grze i po powrocie do niej; radość nie spada, a głód rośnie wolniej.
- Lampka jest osobnym, zapamiętywanym elementem pokoju i może pozostać włączona podczas snu.
- Pierwszy system rozwoju relacji: gesty i karmienie tworzą punkty opieki, które prowadzą przez cztery etapy wzrostu.
- Wygląd rozwija się zgodnie z kanonem: 1, 2, 3 i 5 listków oraz stopniowo wyrastające dwie rączki.
- Niumpi rozpoznaje dominujący styl relacji: zabawowy, senny, odkrywczy, czuły albo „wild-hearted”; styl zmienia ruch, blask, kształt i wzory listków.
- Onboarding „first meeting”: imię, hasło nastroju i charakter (`Energetic`, `Chill`, `Curious`) wybierane w trzech krokach; wracający gracz dostaje łagodniejszą wersję powitania.
- Charakter zmienia wagi spontanicznych zachowań, ale nigdy nie nadpisuje sygnałów potrzeb.
- Karta „My Buddy”: imię, hasło, status relacji, dzień ostatniej opieki i ulubiony gest; profil edytowalny bez utraty postępu.
- Warstwa mikro-informacji zwrotnej: toasty przy kamieniach milowych, unoszące się iskierki przy każdym geście i puls paska więzi.
- Klucz zapisu `niumpi-memory-v3` z automatyczną migracją z `v2` i `v1`.
- Redesign interfejsu: jeden panel aplikacji na pastelowym gradiencie, sekcje ułożone w ciągłą kompozycję, bez odcięcia góra/dół.
- System tokenów w `:root` (kolory, odstępy, promienie, cienie, typografia, czasy) zamiast rozsypanych wartości.
- Ekran podzielony na komponenty: `GameHeader`, `SpeechBubble`, `StatsCard`, `RoomWindow`, `BuddyCard`, `GrowthCard`, `PersonalityBanner`, `SnackBar`, `ActionBar`, `Toasts`; wspólne stałe w `gameConfig.ts`.
- Karmienie ma alternatywę dotykową i klawiaturową: wybór przysmaku, potem dotknięcie Niumpiego. Przeciąganie działa jak wcześniej.
- Postać skaluje się przez `container-type: size`, więc listki i animacja unoszenia zachowują proporcje na każdym ekranie.
- Pora dnia zmienia wyłącznie scenę i okno; reszta interfejsu zostaje jasna.

## Ochrona zakresu

Największe ryzyko to przedwczesne dodawanie zawartości. Każdy kolejny pomysł należy sprawdzić pytaniem: „Czy poprawia przyjemność kontaktu i budowania relacji z Niumpim?”. Jeśli nie, odkładamy go na później.
