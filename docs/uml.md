# UML Diagrams

Acest document conține diagrame Mermaid generate pe baza implementării curente Rentz Arena, în special din fluxurile din `backend/socketManager.js`, serviciile de persistență și boți, modelele MongoDB și integrarea socket din `frontend/src/App.jsx`.

## Software Architecture Overview

Imaginea de mai jos oferă o vedere de ansamblu a arhitecturii proiectului, inclusiv clientul web, serviciile backend, persistența și serviciile AI configurate în proiect.

![Rentz Arena Software Architecture](./assets/rentz-arena-software-architecture.png)

## Sequence Diagram — Card Play Flow

Diagrama urmărește fluxul real pentru `play_card`: clientul emite evenimentul socket, `socketManager` delegă în `playCardForPlayer`, engine-ul validează tura și cartea, aplică regulile active la final de trick, transmite update-urile către toți clienții și poate porni automat mutarea unui bot.

```mermaid
sequenceDiagram
    autonumber

    actor Player as Jucator
    participant UI as Client Web
    participant Socket as Socket Server
    participant Engine as Game Engine
    participant Ruleset as Ruleset Evaluator
    participant Bot as Bot Service
    participant DB as MongoDB
    participant Others as Ceilalti clienti

    Player->>UI: Alege o carte din mana
    UI->>Socket: play_card(roomId, card)
    Socket->>Engine: playCardForPlayer(roomId, userId, card)
    Engine->>Engine: Valideaza phase, turnIndex, currentPlayerId si hand

    alt Mutare invalida
        Engine-->>Socket: { error }
        Socket-->>UI: game_error
    else Mutare valida
        Engine->>Engine: Scoate cartea din handsReady si o adauga in currentTrick
        Engine->>Engine: Actualizeaza currentPlayerId sau marcheaza trickPending
        Engine-->>Socket: game_update + hand_update
        Socket-->>UI: Actualizeaza masa si mana locala
        Socket-->>Others: Broadcast game_update

        alt Trick complet
            Engine->>Engine: Determina castigatorul dupa trickSuit
            Engine->>Ruleset: applyActiveRulesetToTrick(...)
            Ruleset-->>Engine: scoreDelta, componentDeltas, gameEnded
            Engine-->>Socket: trick_won
            Socket-->>UI: Afiseaza castigatorul trick-ului
            Socket-->>Others: Broadcast trick_won

            alt Runda se termina
                Engine->>Ruleset: applyActiveRulesetAtRoundEnd() daca regula este end_game
                Ruleset-->>Engine: scoreDeltas finale de runda
                Engine->>Engine: finishSmallGameRound() si phase = round_stats
                Engine-->>Socket: round_finished
                Socket-->>UI: Deschide statistica rundei
                Socket-->>Others: Broadcast round_finished

                opt Meciul devine finished
                    Engine->>DB: Persista MatchHistory si update-uri ELO
                    DB-->>Engine: Confirmare
                    Engine-->>Socket: game_finished
                    Socket-->>UI: Afiseaza clasamentul final
                    Socket-->>Others: Broadcast game_finished
                end
            else Runda continua
                Engine->>Engine: Reseteaza currentTrick si pregateste urmatorul trick
                Engine-->>Socket: trick_end
                Socket-->>UI: Pregateste trick-ul urmator
                Socket-->>Others: Broadcast trick_end
            end

            opt Urmatorul jucator este bot
                Engine->>Bot: scheduleBotActionIfNeeded()
                Bot->>Bot: chooseBotMove(...) pe baza mutarilor legale
                Bot-->>Engine: Mutare aleasa
                Engine->>Engine: Aplica aceeasi cale playCardForPlayer(..., auto=true)
                Engine-->>Socket: Emite noile evenimente de joc
                Socket-->>UI: Actualizare automata
                Socket-->>Others: Broadcast
            end
        else Trick incomplet
            Engine->>Engine: Seteaza urmatorul jucator si timer-ul

            opt Urmatorul jucator este bot
                Engine->>Bot: scheduleBotActionIfNeeded()
                Bot->>Bot: chooseBotMove(...)
                Bot-->>Engine: Carte aleasa
                Engine->>Engine: Aplica playCardForPlayer(..., auto=true)
                Engine-->>Socket: Emite noile evenimente de joc
                Socket-->>UI: Actualizare automata
                Socket-->>Others: Broadcast
            end
        end
    end
```

## State Diagram — Game / Match

Diagrama surprinde ciclul de viață al meciului live așa cum este modelat în `activeGames`: alegerea `NV`, selecția de ruleset, jocul pe trick-uri, statistica de rundă, reconectarea, salvarea și reluarea din `SavedGame`, plus închiderea meciului.

```mermaid
stateDiagram-v2
    [*] --> Initializing: start_game sau start_training_match

    state "initializing" as Initializing
    state "choosing_nv" as ChoosingNV
    state "choosing_ruleset" as ChoosingRuleset
    state "playing_round" as PlayingRound
    state "waiting_reconnect" as WaitingReconnect
    state "round_stats" as RoundStats
    state "saved live session closed" as SavedLive
    state "resumed live match" as ResumedLive
    state "finished" as Finished

    Initializing --> ChoosingNV: beginChooserTurn sau startTrainingRound
    ChoosingNV --> ChoosingRuleset: set_nv_choice in meci standard
    ChoosingNV --> PlayingRound: set_nv_choice in training
    ChoosingRuleset --> PlayingRound: choose_ruleset

    PlayingRound --> PlayingRound: play_card si trick incomplet
    PlayingRound --> RoundStats: finishSmallGameRound
    PlayingRound --> WaitingReconnect: disconnect cu autoBotReplacementEnabled=false
    PlayingRound --> PlayingRound: markPlayerAbandonedDuringGame / inlocuire cu bot
    PlayingRound --> Finished: host_leave_match(mode=end_room) sau finishBigGame

    WaitingReconnect --> PlayingRound: restore_session sau accept_resume_rejoin
    WaitingReconnect --> PlayingRound: timeout / replace_player_with_bot

    RoundStats --> ChoosingNV: continue_match
    RoundStats --> SavedLive: save_and_quit
    RoundStats --> Finished: end_game
    RoundStats --> Finished: nu mai exista alegeri ramase

    SavedLive --> ResumedLive: resume_saved_game
    ResumedLive --> PlayingRound: snapshot.phase = playing_round
    ResumedLive --> RoundStats: snapshot.phase = round_stats

    Finished --> [*]
```

## State Diagram — Room / Lobby

Diagrama descrie ciclul camerei gestionate în `lobbies`: creare, configurare și pregătire înainte de start, trecerea în joc activ și închiderea camerei după ștergere, salvare sau terminarea sesiunii live.

```mermaid
stateDiagram-v2
    [*] --> Created

    state "creat" as Created
    state "waiting" as Waiting
    state "playing" as Playing
    state "closed / deleted" as Closed

    Created --> Waiting: create_lobby

    Waiting --> Waiting: join_lobby
    Waiting --> Waiting: leave_lobby
    Waiting --> Waiting: toggle_ready
    Waiting --> Waiting: set_lobby_role
    Waiting --> Waiting: update_room_settings
    Waiting --> Waiting: add_bot_to_lobby sau remove_bot_from_lobby
    Waiting --> Waiting: transfer_host, kick_member sau ban_member
    Waiting --> Playing: start_game sau start_training_match
    Waiting --> Closed: delete_lobby
    Waiting --> Closed: fara jucatori activi dupa leave sau disconnect

    Playing --> Playing: join_lobby ca spectator
    Playing --> Playing: leave_spectating
    Playing --> Playing: lobby_update pentru host nou, reconnect sau bot replacement
    Playing --> Closed: save_and_quit
    Playing --> Closed: end_game plus closeLiveGameSession
    Playing --> Closed: host_leave_match(mode=end_room)

    Closed --> [*]
```

## State Diagram — Player Session

Diagrama urmărește sesiunea unui utilizator prin lobby, joc activ sau spectare, inclusiv refresh/reopen, `restore_session`, promptul de rejoin, abandonul, banarea și înlocuirea cu bot după timeout sau refuz.

```mermaid
stateDiagram-v2
    [*] --> Connected

    state "Connected" as Connected
    state "In lobby (player)" as InLobbyPlayer
    state "In lobby (spectator)" as InLobbySpectator
    state "In match" as InMatch
    state "Spectating active match" as Spectating
    state "Disconnected / grace period" as Disconnected
    state "Prompt de rejoin" as RejoinPrompt
    state "Replaced by bot" as ReplacedByBot
    state "Banned" as Banned
    state "Left" as Left
    state "Finished" as Finished

    Connected --> InLobbyPlayer: create_lobby sau join_lobby
    Connected --> InLobbySpectator: join_lobby(asSpectator)
    Connected --> RejoinPrompt: notificare resume_rejoin

    InLobbyPlayer --> InLobbySpectator: set_lobby_role(spectator)
    InLobbySpectator --> InLobbyPlayer: set_lobby_role(player)
    InLobbyPlayer --> InMatch: start_game sau start_training_match
    InLobbySpectator --> Spectating: jocul pornește sau join_lobby pe un room deja playing
    InLobbyPlayer --> Left: leave_lobby
    InLobbySpectator --> Left: leave_lobby
    InLobbyPlayer --> Banned: ban_member

    InMatch --> Disconnected: disconnect
    Spectating --> Disconnected: disconnect
    Disconnected --> RejoinPrompt: get_reconnect_state [available]

    RejoinPrompt --> InMatch: restore_session sau accept_resume_rejoin
    RejoinPrompt --> Spectating: restore_session [rol spectator]
    RejoinPrompt --> Left: abandon_session
    RejoinPrompt --> ReplacedByBot: decline_resume_rejoin sau timeout

    InMatch --> ReplacedByBot: abandon_match sau replace_player_with_bot
    InMatch --> Left: host_leave_match(transfer_and_leave) sau leaveCurrentRoomForResumeJoin
    Spectating --> Left: leave_spectating
    InMatch --> Banned: ban_member
    Spectating --> Banned: ban_member

    InMatch --> Finished: game_finished
    Spectating --> Finished: game_finished
    ReplacedByBot --> Finished: meciul se termina fara rejoin

    Banned --> [*]
    Left --> [*]
    Finished --> [*]
```

## State Diagram — Saved Game

Diagrama rezumă ciclul unui `SavedGame` din MongoDB: creare prin `save_and_quit`, apariție în Library, reluare cu `resume_saved_game`, notificări de `resume_rejoin`, înlocuirea jucătorilor indisponibili cu boți și finalizarea sau închiderea definitivă.

```mermaid
stateDiagram-v2
    [*] --> LiveRoundStats

    state "Live match in round_stats" as LiveRoundStats
    state "saved" as Saved
    state "resume_pending" as ResumePending
    state "resumed" as Resumed
    state "completed" as Completed
    state "ended" as Ended

    LiveRoundStats --> Saved: save_and_quit / createSavedGameDocument
    Saved --> Saved: apare in Library prin serializeSavedGameForLibrary
    Saved --> ResumePending: ownerul cere resume_saved_game
    ResumePending --> Resumed: SavedGame.status = resumed si se recreeaza room-ul live
    ResumePending --> ResumePending: notificari resume_rejoin catre jucatorii online
    ResumePending --> Resumed: jucatorii revin sau cei indisponibili sunt inlocuiti cu boți

    Resumed --> Completed: meci terminat / persistCompletedMatchHistory
    Saved --> Ended: POST /api/games/saved/:savedGameId/end
    Ended --> [*]
    Completed --> [*]
```
