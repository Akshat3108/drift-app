import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { logError } from '../core/utils/log';

// Class component is required for componentDidCatch / getDerivedStateFromError.
// One instance wraps each feature screen so a crash on (say) Trends does not
// blank Home. The boundary itself reads no app context — it must keep working
// even if AppProvider blew up.

const FALLBACK_BG = '#fdf6f0';
const FALLBACK_INK = '#2a241f';
const FALLBACK_INK2 = '#6b5e54';
const FALLBACK_CORAL = '#e85d44';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError(`boundary:${this.props.name || 'unknown'}`, error);
    if (__DEV__ && info?.componentStack) {
      // eslint-disable-next-line no-console
      console.warn(info.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const label = this.props.name || 'this screen';
    return (
      <View style={{
        flex: 1, backgroundColor: FALLBACK_BG, alignItems: 'center',
        justifyContent: 'center', padding: 32,
      }}>
        <Text style={{ fontSize: 44, marginBottom: 12 }}>🌧️</Text>
        <Text style={{ fontSize: 18, color: FALLBACK_INK, fontWeight: '500' }}>
          Something went sideways
        </Text>
        <Text style={{ fontSize: 13, color: FALLBACK_INK2, textAlign: 'center', marginTop: 8 }}>
          We couldn't render {label}. Your data is safe.
        </Text>
        {__DEV__ && (
          <Text style={{ fontSize: 11, color: FALLBACK_INK2, marginTop: 12, textAlign: 'center' }}>
            {this.state.error?.message || String(this.state.error)}
          </Text>
        )}
        <TouchableOpacity
          onPress={this.reset}
          activeOpacity={0.85}
          style={{
            marginTop: 24, backgroundColor: FALLBACK_CORAL,
            borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

// HOC: wraps a screen component so it gets an isolated boundary.
// Use inside navigation: component={withBoundary('Home', HomeScreen)}.
export function withBoundary(name, ScreenComponent) {
  const Wrapped = (props) => (
    <ErrorBoundary name={name}>
      <ScreenComponent {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `Boundary(${name})`;
  return Wrapped;
}
