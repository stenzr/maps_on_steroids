import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LatLng } from '@roadtrip/core';
import { api, errorMessage, type DestinationResult } from '@/services/api/proxyClient';
import { colors, radius, spacing } from '@/theme';

/**
 * Destination bar. Searches on submit (not per keystroke) to keep Places calls low.
 */
export function DestinationSearch({ near, onPick }: { near: LatLng | null; onPick: (d: DestinationResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (): Promise<void> => {
    const q = query.trim();
    if (q.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.destinations(q, near);
      setResults(r);
      if (r.length === 0) setError('No places found.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (!t) setResults([]);
          }}
          placeholder="Where to? e.g. Nashik"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          style={styles.input}
          accessibilityLabel="Destination"
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {(results.length > 0 || error) && (
        <View style={styles.results}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {results.map((r) => (
            <Pressable
              key={r.placeId}
              style={styles.result}
              onPress={() => {
                Keyboard.dismiss();
                setResults([]);
                setQuery(r.name);
                onPick(r);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.name}>{r.name}</Text>
              {r.address ? (
                <Text style={styles.addr} numberOfLines={1}>
                  {r.address}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    elevation: 4,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing(2) },
  results: { backgroundColor: colors.surface, borderRadius: radius.md, marginTop: spacing(1), elevation: 6, overflow: 'hidden' },
  result: { padding: spacing(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontWeight: '700', color: colors.text, fontSize: 15 },
  addr: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, padding: spacing(3) },
});
