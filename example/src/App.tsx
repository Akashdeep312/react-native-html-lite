import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  HtmlView,
  isNativeParserAvailable,
  type ParserMode,
} from 'react-native-html-lite';

const SAMPLE = `
<h2>Property policies</h2>
<p>Check-in from <b>2:00 PM</b>, check-out until <b>11:00&nbsp;AM</b>.
Guests must present a valid photo ID &mdash; <i>passport, driving licence</i>.</p>
<ul>
  <li>Pets are <span style="color: #c0392b; font-weight: 600">not allowed</span>.
  <li>Extra beds on request:
    <ol type="a">
      <li>Child under 6: free
      <li>Adult: &#8377;1,500 per night
    </ol>
  <li class="text-green">Free cancellation until 24 hours before check-in.
</ul>
<p style="text-align: center; font-size: 0.85em">
  Read our <a href="https://example.com/terms">terms &amp; conditions</a>.
</p>
<blockquote>Unclosed tags, stray </span> end tags and &unknown; entities are fine.</blockquote>
<table>
  <tr><th>Room</th><th>Price</th></tr>
  <tr><td>Deluxe</td><td align="right">&#8377;4,200</td></tr>
  <tr><td>Suite</td><td align="right">&#8377;7,900</td></tr>
</table>
`;

const MODES: ParserMode[] = ['auto', 'native', 'js'];

export default function App() {
  const [mode, setMode] = useState<ParserMode>('auto');
  const nativeAvailable = isNativeParserAvailable();

  return (
    <View style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.status}>
          Native parser: {nativeAvailable ? 'linked' : 'not linked'}
        </Text>
        <View style={styles.modes}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.mode, m === mode && styles.modeActive]}
            >
              <Text style={m === mode ? styles.modeTextActive : undefined}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        <HtmlView
          html={SAMPLE}
          parser={mode === 'native' && !nativeAvailable ? 'js' : mode}
          baseStyle={styles.base}
          tagsStyles={{ p: { marginVertical: 6 }, h2: { color: '#1f2d3d' } }}
          classesStyles={{ 'text-green': { color: '#1e8449' } }}
          textProps={{ allowFontScaling: false }}
          onLinkPress={(href) => Alert.alert('Link pressed', href)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: 48, backgroundColor: '#ffffff' },
  content: { padding: 16 },
  status: { marginBottom: 8, color: '#555555' },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  mode: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#245dc1',
  },
  modeActive: { backgroundColor: '#245dc1' },
  modeTextActive: { color: '#ffffff' },
  base: { fontSize: 15, color: '#222222', lineHeight: 22 },
});
