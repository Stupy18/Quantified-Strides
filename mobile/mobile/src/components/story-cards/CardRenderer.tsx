import React from 'react'
import { View, Text } from 'react-native'
import { StoryMoment } from '../../utils/storyTriggers'
import { useTheme } from '../../hooks/useTheme'
import { TEXT } from '../../theme'
import {
  FormFreshCard,
  WeekInNumbersCard,
  NewPRCard,
  HRVCard,
  FitnessTrajectoryCard,
  RunDecodedCard,
  IronSessionCard,
  BodyReadyCard,
  SleepArchCard,
  MonthReviewCard,
} from './cards'

interface Props {
  moment: StoryMoment
}

export function CardRenderer({ moment }: Props) {
  const theme = useTheme()
  const p = moment.payload as any

  switch (moment.type) {
    case 'form_fresh':
      return <FormFreshCard tsb={p.tsb} ctl={p.ctl} atl={p.atl} rampRate={p.rampRate} history={p.history ?? []} />
    case 'week_in_numbers':
      return <WeekInNumbersCard sessions={p.sessions} totalMin={p.totalMin} totalKm={p.totalKm} sports={p.sports ?? []} recentLoad={p.recentLoad ?? []} />
    case 'new_pr':
      return <NewPRCard exerciseName={p.exerciseName ?? 'Lift'} newPR={p.newPR} previousPR={p.previousPR ?? 0} sessionDate={p.sessionDate ?? ''} />
    case 'nervous_system':
      return <HRVCard lastHrv={p.lastHrv} baseline={p.baseline} deviation={p.deviation} status={p.status} trend={p.trend} nights={p.nights ?? []} />
    case 'fitness_trajectory':
      return <FitnessTrajectoryCard currentCtl={p.currentCtl} rampRate={p.rampRate} history={p.history ?? []} />
    case 'run_decoded':
      return <RunDecodedCard cadence={p.cadence} gct={p.gct} vo={p.vo} hrDrift={p.hrDrift} fatigue={p.fatigue} date={p.date ?? ''} />
    case 'iron_session':
      return <IronSessionCard sessionDate={p.sessionDate ?? ''} sessionType={p.sessionType} totalSets={p.totalSets} totalExercises={p.totalExercises} exercises={p.exercises ?? []} />
    case 'body_ready':
      return <BodyReadyCard overallFeel={p.overallFeel} legs={p.legs} upper={p.upper} joints={p.joints} muscles={p.muscles ?? {}} />
    case 'sleep_arch':
      return <SleepArchCard avgScore={p.avgScore} todayScore={p.todayScore} todayHrv={p.todayHrv} nights={p.nights ?? []} />
    case 'month_review':
      return <MonthReviewCard totalSessions={p.totalSessions} totalKm={p.totalKm} sports={p.sports ?? {}} currentCtl={p.currentCtl} />
    default:
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[TEXT.narrativeMedium, { color: theme.textFaint }]}>Moment unavailable.</Text>
        </View>
      )
  }
}
