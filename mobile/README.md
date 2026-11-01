# Dream Edge — mobile app

The student-facing Flutter app. Android first; iOS builds but has had no
device testing.

## Running it

```
flutter pub get
flutter run
```

`lib/config/app_config.dart` holds the Supabase URL, the anon key and
`apiBaseUrl` — the website whose API routes sign document URLs. The anon key
is a public credential by design: it carries no privilege of its own and RLS
decides what it can read. `apiBaseUrl` must point at the deployment students
actually use; a preview URL works until that deployment is replaced.

## Running the tests

```
flutter test
```

**On Windows this needs the Visual Studio C++ build tools.** Not for the app —
for the test runner. `pdfrx`, which backs the PDF reader, depends on
`pdfium_dart`, and that compiles PDFium from source as a Dart native asset for
whatever platform the code is running on. `flutter test` runs on the host, so
the host needs a C toolchain. Without one the run fails before any test
executes, with `Running "where vswhere.exe"` followed by
`Building native assets failed`.

Install "Desktop development with C++" from the Visual Studio Installer and it
goes away. Linux and macOS generally already have a usable toolchain, so CI is
unaffected, and so is `flutter build apk` — the Android build takes PDFium
through Gradle and never touches the host compiler.

`flutter config --no-enable-native-assets` does not help: `pdfium_dart`
requires the feature and refuses to resolve without it.

The 1.x line of `pdfrx` needed none of this, but it does not compile under
Dart 3.13 — there are unsound null checks inside the package that the current
compiler rejects — so 2.x is the only version that builds. `intl` is pinned at
0.20 because 2.x requires it.

## Where things live

| Path                   | What                                                   |
|------------------------|--------------------------------------------------------|
| `lib/config/`          | Supabase config, router, theme, constants              |
| `lib/core/models/`     | Row shapes, each with `fromJson`/`toJson`              |
| `lib/core/services/`   | The network layer. Knows nothing about caching         |
| `lib/core/repositories/` | Cache-first reads over those services                |
| `lib/core/offline/`    | The offline database, download queue, licences, sync   |
| `lib/core/providers/`  | Riverpod wiring                                        |
| `lib/features/`        | One folder per screen area                             |

## Offline mode

A student with no connection can open the app, browse what is cached, and play
or read anything they downloaded. The parts worth knowing before changing any
of it:

- `lib/core/offline/offline_db.dart` holds two kinds of table. The `cached_*`
  mirrors are disposable — losing them costs a refresh. `downloads` and
  `progress_queue` are not: one records files that exist on this device, the
  other holds watched positions that have not reached the server.
- A downloaded copy is only playable while its licence stands. Each successful
  entitlement check extends it; a device that never comes back online never
  gets an extension, which is what stops a paid lesson becoming permanently
  free after one download. Revocation deletes the file, not just a flag.
- `check_offline_entitlements` in Postgres is the single definition of the
  paywall rule, shared with the website and the Edge Function. Do not restate
  it in Dart.
- Tests and quizzes are online-only. They are scored server-side, so a
  downloaded one could be re-attempted with nothing recording it.
