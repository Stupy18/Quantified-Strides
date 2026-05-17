import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { ActiveTheme } from '../src/theme';

export default function Index() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: ActiveTheme.bgPage, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={ActiveTheme.accent} />
      </View>
    );
  }

  return <Redirect href={token ? '/(tabs)/today' : '/(auth)/login'} />;
}