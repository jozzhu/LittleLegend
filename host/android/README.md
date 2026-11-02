# Android host engineering preview

## Latest build (2026-11-01)

Current version: 1.0.0 (version code 11). The launcher opens the renamed `gz.html` spectator page. The web app includes searchable, filterable, movable and resizable game references. See `../../docs/BUILD.md` for clean-source build instructions and `../../docs/VALIDATION-1.0.0.md` for current validation. Historical engineering notes follow.

## Previous device validation

This is an Android host engineering preview. The 0.1.2 debug APK has been built, signature-verified and installed as an update on a Mi 10 Pro without clearing application data. Native loading, server startup, LAN HTTP access and graceful stop passed a device smoke test. Full multiplayer and background persistence testing remain outstanding. It runs the same Node rules/account server in a separate foreground-service process. Only the host installs it; players use their browsers. The launcher uses landscape orientation; external browsers are prompted to rotate rather than being forcibly rotated.

## Build prerequisites

- Android Studio with Android SDK 35, NDK and CMake 3.22.1, JDK 17.
- Gradle compatible with Android Gradle Plugin 8.7.3 (for example 8.9); a downloaded wrapper is not bundled.
- A maintained Android arm64 nodejs-mobile build supporting this application's Node APIs (Node 18+), including `crypto.scryptSync`, `crypto.randomUUID`, `structuredClone`, `node:` imports, HTTP connection shutdown APIs, and filesystem/network interfaces. Stock desktop node.exe cannot be used on Android.
- Place the matching nodejs-mobile headers in `app/src/main/nodejs-mobile/include/node/` and matching arm64 `libnode.so` in `app/src/main/jniLibs/arm64-v8a/`. Headers and library must come from the same build; validate origin and checksum. Any additional native shared libraries required by that build must be packaged alongside it.

Build using `./host/android/build.ps1` from the repository root. This first generates Android and Windows icons from `assets/app_icon.png`. For direct Android Studio builds, run `./host/build-icons.ps1` first. `stageGame` copies only explicitly allowlisted server code and public web files, never real account data, backup folders, original documents, or admin keys.

## Local build status (2026-10-30)

- Installed project-local SDK platform 35, build-tools 35.0.0, NDK 27.2.12479018, CMake 3.22.1, Gradle 8.9; uses the existing JDK 17. Platform-tools were copied from the existing local installation.
- Embedded matching headers and arm64 libnode.so from the official nodejs-mobile v18.20.4 Android release. Runtime archive SHA256: `bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af` (recorded local digest; upstream release did not publish a digest). Google SDK archives were checked against Google's repository SHA1 metadata; mirror-downloaded Gradle was verified against Gradle's official SHA256.
- Build with `./host/android/build.ps1` from the repository root. Uses an ASCII temporary staging directory and a junction to local tools to avoid Windows NDK Unicode-path linker failures. Does not move original source or user data.
- Output: `release/android/LittleLegendHost-debug.apk`. Debug signed; APK signature verification passed. This is not a production signing identity.
- The bridge explicitly uses `ANDROID_STL=c++_shared`, so Android Gradle packages the NDK's matching C++ runtime alongside libnode.so. `verify-apk.ps1` rejects an APK missing libnode.so, liblegendhost.so, libc++_shared.so, or the adaptive icon before publishing it. Version code is now 3 (0.1.2).
- The embedded Node build does not support Unicode property escapes. Avatar validation now uses generated explicit Unicode ranges instead; `host/generate-avatar-characters.js` regenerates the checked-in table using desktop Node. A regression test compares every Unicode code point with the original letter/number/symbol categories. Browser and server use the same table.
- The update installed successfully on Mi 10 Pro (Android 13, arm64, 4 KB pages), preserving app data. Tapping Start launched the Node foreground service with an automatically assigned port. The computer fetched the game page, all 37 catalog entries, and the avatar character script through the phone's Wi-Fi LAN address. Writing the normal stop marker terminated the service cleanly. No account or gameplay data was created for this test. OEM screen-off persistence and full multiplayer play have not been verified.
- The Windows executable embeds a multi-resolution ICO generated from the same artwork. Its launcher start, HTTP response and graceful stop passed a smoke test with a temporary data directory; the temporary server was stopped afterward. Port 4174 remains stopped.
- Bundled Node 18 is an older upstream mobile runtime. Treat this build as trusted-LAN testing only, not a hardened internet-facing release; upgrade and audit the runtime before exposing accounts publicly. Android devices with 16 KB memory pages have not been verified.

## Update 0.1.4 (2026-11-01)

Account deletion now preserves shared rooms, archives and other participants' history.
The admin confirmation lists active rooms, phase and host status. Active seats surrender
before deletion; hosting transfers clockwise. A separate confirmed reset clears all test
data. See `../data-management.md` for storage paths and deletion scope.
Finished/dissolved room codes can be reused without deleting archived matches.
Guests request both pause and resume; hosts approve or perform either directly.
Each replacement pair now has an opt-in both-roles setting and independent card counts.
Both build scripts regenerate OS icons from the project `assets/app_icon.png`.
Version code 5; automated tests and Windows temporary-store smoke passed.
The APK signature and embedded sources were verified; no phone was connected for
this version's installation test.

## Update 0.1.5 (2026-11-01)

Surrender now leaves the player at the live table with a loss indicator. After the
match ends, any participant can return the shared room to preparation; the host
still starts the next game. Log names use distinct seat colors.
Room settings isolate card-count inputs from unrelated table data attributes.
Replacement/EX presets update their default counts immediately, offer separate
enable-all controls, and reset only overrides affected by a preset change.
Enabled cards retain final custom count precedence; disabled cards are excluded.
Saving valid settings closes the dialog. Errors use a top-layer toast.
Version code 6; 107 automated checks pass. No browser visual/device installation
test is claimed. The preview ports remain stopped.

## Update 0.1.6 (2026-11-01)

Integrated the approved 6.4-second HTML opening using existing battlefield, card-back
and faction-emblem assets. The legacy lobby stays masked from the first HTML paint.
Catalog/account loading runs alongside the animation; entry waits for both. Skip
ends only the animation, connection failures offer retry, and reduced-motion systems
show the final scene immediately. Preview-only replay/pause controls are excluded.
Version code 7; 113 automated checks pass, including opening/data coordination,
expired sessions, retry and animation cleanup.

## Update 0.1.7 (2026-11-01)

Aligned login with the approved opening: shared battlefield, letterbox bars, faction
emblems and typography. Shared elements move from the opening's final positions
into the login layout as the form fades in. Reduced motion enters immediately.
Version code 8; 115 automated checks pass. Device visual validation remains pending.

## Update 0.1.8 (2026-11-01)

Room ownership now transfers clockwise on departure in every phase. Surrender keeps
the player at the table as a spectator; the last actual departure removes the room
and releases its code. Replays survive while at least one participant account exists,
including recoverably disabled accounts. Permanent deletion and startup clear orphan
archives and empty rooms.

Unfinished matches abandoned by everyone are archived as interrupted without wins
or losses. Profiles show total, valid and interrupted matches with win rate based
on valid matches. Interrupted matches do not alter completed-match achievements.
Version code 9; automated coverage includes persistence, room lifecycle and cleanup.

## Update 0.1.9 (2026-11-01)

Rebuilt the landscape host console around the Windows design: battlefield art,
dark surfaces, gold actions, separate service controls, address and live statistics.
The GM button obtains a one-time local entry and opens a read-only omniscient page.
Online users are deduplicated over a 30-second authenticated heartbeat window.
GM entry is recorded in room events/replays; spectators do not occupy player seats.
Version code 10. No GM match-control features are included.

## Validation before release

Test cold start, automatic/occupied ports, phone hotspot and Wi-Fi LAN, browser cookie login, all 37 card effects, five-player traffic, app background/screen-off behavior, notification permissions, graceful stop/restart, persistent accounts/replays, private admin-key access, interrupted startup, and stale-lock recovery. Android OEM background restrictions can still terminate hosting; advise keeping the host plugged in. Do not claim uninterrupted hosting until device testing passes.

Accounts remain in the application's private files/data directory. Uninstalling the app deletes these files; backup/export support is not yet implemented. The foreground service is explicitly user-started, not auto-started after a reboot or OS kill. Do not configure public tunneling without HTTPS and a security review.
