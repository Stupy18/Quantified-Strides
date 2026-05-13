# CURRENT.md — Live Sprint State

## In Progress

### Story Cards — Mobile (branch: research)

10 animated story cards built and rendering on device. Two confirmed visible (HRV + Iron Session). Visual redesign of those two cards in progress — white screen issue on last reload needs diagnosis before confirming redesign works.

**What's done:**
- All 10 card components built (`FormFreshCard`, `WeekInNumbersCard`, `NewPRCard`, `HRVCard`, `FitnessTrajectoryCard`, `RunDecodedCard`, `IronSessionCard`, `BodyReadyCard`, `SleepArchCard`, `MonthReviewCard`)
- `StoryCardShell` — gradient bg, aspect ratio toggle (9:16 / 1:1), PNG share via `react-native-view-shot`
- `StoriesViewer` — horizontal paged scroll, dot indicators
- `storyTriggers.ts` — ephemeral AsyncStorage system, 24h TTL, 10 trigger evaluators
- Today tab wired — `MomentSurface` shows active moment, absent when none
- `app/stories.tsx` stack screen
- All API hooks: `useHRVHistory`, `useBiomechanics`, `useSleepTrends`, `useStrengthSessions`, `useWeeklyVolume`
- TypeScript clean (0 errors)
- App running on physical device via Expo Go + WSL2 port forwarding

**What's next:**
- Confirm visual redesign renders correctly (HRV + Iron Session cards)
- Redesign remaining 8 cards to same visual standard (big hero numbers, accent lines, editorial typography)
- All 10 cards need visual QA on device
- `StoryCardShell` grain overlay removed (FeTurbulence unsupported on iOS) — consider alternative texture approach
- Phase 2: video export via `ffmpeg-kit-react-native` (EAS Build required)

## Blocked

- White screen on last reload — cause unconfirmed. Likely FeTurbulence SVG filter crash (removed), or hooks ordering issue in HRVCard (fixed). Needs device confirmation.

## Infrastructure Fixes This Session

- `docker-compose.yml` healthcheck typo fixed (`pg_is  ready` → `pg_isready`)
- Root `.env` created with `MOBILE_HOST_IP=192.168.0.220`
- `mobile/.env.development` updated: correct LAN IP for API + `REACT_NATIVE_PACKAGER_HOSTNAME`
- Package versions aligned to Expo SDK 54: `react-native-worklets@0.5.1`, `babel-preset-expo@54.0.10`, `react-native-view-shot@4.0.3`
