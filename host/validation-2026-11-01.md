# Table interaction update (0.1.3)

## Automated coverage

- Every attack requires a target response decision, including targets with no available response card. Multi-target attacks wait clockwise before resolving.
- Hidden choices shuffle a copy of the target cards. Public views expose opaque option keys and faction backs, never target card identities.
- Mage/name declarations include the target, declared level/name and outcome in public events.
- Bat notice close acknowledges the reveal, ignores stale acknowledgements and cannot overwrite a newer room session.
- Card renders reuse image nodes. Draw-deck hover/focus/active states preserve the faction back image.
- Logs escape player text and render faction-colored card references with effect descriptions.
- Discards have a shared chronological order across factions; the table displays the most recent three.
- Normal inputs disable autocomplete, autocorrect and capitalization, including dynamically inserted fields; explicit account credential fields retain their settings.
- The full suite includes forty complete two-to-five-player rule simulations.

## Browser / device acceptance plan

No host-managed browser is available in this session. No browser visual QA or score is claimed. ADB currently reports no connected phone. The earlier 0.1.2 device smoke test does not validate 0.1.3.

Test two and five players at 1280x720 and 1920x1080, plus landscape phones:

1. Attack with and without defense cards: each target sees a decision, while the attacker cannot see available defense choices.
2. Use Bat, close with X, then trigger polling/chat updates: the reveal stays closed. Check Escape and the confirmation button too.
3. Hover and keyboard-focus royal/monster card names in logs. Verify effects, text escaping and tooltip positioning near screen edges.
4. Submit chat twice and reopen settings/profile forms. Check that browser history suggestions are disabled while account password saving remains available.
5. Check all players' face-up board cards and back-facing hand indicators, including horizontal overflow with many cards.
6. Repeatedly choose another player's hidden cards. Ensure their selection order is shuffled, without changing actual hand order or revealing card names.
7. Hover and click both draw decks repeatedly: back art remains visible and newly acquired cards enter without image replacement flicker.
8. Discard alternating factions, inspect the latest three and open the entire discard gallery.
9. Make mage/witch/clown declarations and confirm all connected players receive the announcement and public log entry.
10. Check short interaction feedback, replay stepping and the OS reduced-motion setting. Bitmap effect overlays and avatar frames stay disabled.

## 0.1.4 additions

99 automated checks pass. Windows launcher start/HTTP/stop passed using temporary data.
Both distributables contain the current server and web sources. APK signature and
native dependencies pass validation. Icons are generated from assets/app_icon.png.
No browser visual validation or Android device installation is claimed for this update.

11. Admin deletion preview lists each unfinished room, phase, host status and archive count.
12. Delete a host in a three-player match: the next clockwise player becomes host and
    two remaining players can continue. Existing participants retain shared replay access.
13. Delete an account in a two-player match: the other player wins under normal surrender
    rules. The resulting replay and historical replay remain accessible after restart.
14. Delete a lobby host: preserve the shared room and transfer hosting. Ordinary lobby
    host departure continues to dissolve the room, as previously specified.
15. Host pauses/resumes directly. Guest requests pause/resume and host approves/rejects.
16. Each replacement group defaults to one card type; both-roles opt-in enables both,
    with per-card counts overriding the default four. Settings changes reset readiness.
17. Finished/dissolved room numbers can be reused; stale commands cannot affect the
    new match, and shared history remains available by its independent match ID.

## 0.1.5 additions

Regression checks cover default settings save without edits, live preset changes,
separate select-all controls, custom count precedence, invalid input focus, loss without
leaving the table, and returning to preparation from a guest account after match end.
Toast uses a manual popover for browser top-layer placement; older browsers fall back
to displaying within the current dialog. Log player names are colored by seat and
escaped separately from card tooltips, including when a nickname is itself a card name.

Manual browser/device checks remain:

18. Open preparation settings without changing anything; save closes the dialog without
    a quantity error. Try 13 and a decimal quantity; the named error is visible above the dialog.
19. Switch base/replacement roles, toggle each group, simultaneously enable replacements
    and toggle EX. Default labels/placeholders update immediately. Changed presets clear
    only affected overrides. Disabled cards cannot be edited or included.
20. Use the two select-all checkboxes independently; confirm actual deck counts after start.
21. Surrender during a three-player game: stay at the table with a loss emblem and chat.
    In a two-player game, see the finished board and return to preparation as the loser.
22. Verify log name contrast and seat colors at desktop and landscape phone sizes.

No managed browser was exposed for live visual checks in this session, and no connected
Android device was available. Existing 4173/4174/4175 preview ports remain stopped.

## 0.1.6 approved opening

113 automated checks pass. The approved opening is now scoped under #startup-screen,
so its typography and animation do not inherit the application navigation wordmark
styles. The standalone startup-preview.html remains unchanged for reference.

23. Reload with a logged-in session and no session: the legacy lobby must never flash.
24. Delay catalog/account loading: skip must not expose incomplete application state.
25. Disconnect and reconnect: retry keeps the opening visible and then enters correctly.
26. Test reduced-motion preferences, landscape phones and the temporary-password dialog.
27. Confirm all opening animations stop and release their objects after entry.

Automated timing and startup state checks are complete. Browser visual checks and
Android device installation remain unverified in this session.

## 0.1.7 login handoff

115 automated checks pass. Login and the opening now share scene styles: the same
battlefield crop, overlay, letterbox bars, emblems, wordmark and decorative rules.
The login handoff measures the final opening positions and animates the destination
elements to their login positions over 900 ms, introducing the form after 250 ms.
The form remains inert during this handoff. Reduced motion bypasses it.

28. Watch a cold start with no session at desktop and landscape phone sizes:
    background and bars stay still while the identity moves and the form appears.
29. Switch to registration; ensure the extra nickname field and password recovery
    text remain reachable by scrolling the form area on short screens.
30. Verify skip, reduced motion and logout return to a complete, usable login.

No live browser visual check or Android device installation was performed.
Windows page files were updated in place because the running launcher locks its
executable and background image; no native launcher changes were needed.

## 0.1.8 room lifecycle and participation

123 automated checks pass. The Windows launcher also passed start/HTTP/stop smoke
validation using a temporary data directory and an automatically assigned port.
Automated coverage verifies clockwise ownership using seating order, preparation-room
handoff, surrender retaining presence, spectator departures, last-departure dissolution,
room-code release, omniscient interrupted replays, account deletion preserving another
participant's access, recoverable disablement, final participant deletion and startup
cleanup of legacy orphan data.

Interrupted matches contribute only to interrupted/total participation, retain earned
cumulative metrics and do not affect valid games, wins, losses or completed-match
achievement windows. Repeated measurement does not count a match twice; counters
persist after reload. Profile rendering verifies all three counts and effective win rate.

Manual checks remaining: desktop/phone departure dialogs and profile layout, two
devices exiting/rejoining, and host stop/start on the actual data directory. No real
account data was edited during validation. GM tools were discussed but not implemented.

## 0.1.9 host monitoring and GM viewing

128 automated checks pass. Final APK 0.1.9 (version code 10) passes signature and native
library verification; embedded monitoring and web files match the source files.
Online presence uses authenticated sessions, deduplicates users and expires at 30
seconds. Tests exercise revocation, disabled users, local-only GM access, single-use
entry expiration, separate GM cookies, credential-free omniscient state, preserved
participant hand privacy, no GM command endpoint, logged entry, stale match rejection
and room dissolution despite an active GM viewer.

GM client tests cover one-time URL cleanup, rendered hands, card inspection, event
display and ignoring late state after returning to the room list.
Windows smoke verifies live label refresh, game/GM HTTP delivery and graceful stop
using a temporary directory. The captured Windows launcher screenshot was inspected.
The running original Windows launcher prevented replacement, so the complete new
distribution is release/windows-0.1.9. Existing user storage was not changed.

Android Java/native packaging succeeded. No ADB device or emulator is available;
live browser visual checks and Android device layout checks remain pending.
Manually check GM login from the launcher, five-player cards on desktop/phone,
tap-to-inspect cards, expanded piles retaining their open state and empty-room exit.
