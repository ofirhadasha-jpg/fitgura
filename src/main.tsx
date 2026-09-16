import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { View, Text, TouchableOpacity } from 'react-native'
import App from './App'
import './index.css'

class StartupErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Fitgura startup error:', error, info)
  }

  handleRecover = () => {
    try {
      sessionStorage.removeItem('fitgura_screen')
      sessionStorage.removeItem('fitgura_pending_scan')
    } catch {
      // Storage may be unavailable in restricted preview contexts.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View style={{ flex: 1, minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFFEF5' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 8, fontFamily: "'Permanent Marker', cursive" }}>משהו השתבש</Text>
        <Text style={{ fontSize: 16, color: '#6B6B6B', textAlign: 'center', marginBottom: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" }}>אירעה שגיאה בטעינת האפליקציה.</Text>
        <TouchableOpacity onPress={this.handleRecover} activeOpacity={0.8} style={{ backgroundColor: '#FFE566', borderRadius: '3px 12px 4px 10px / 8px 3px 9px 4px', paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' }}>
          <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '700', fontFamily: "'Permanent Marker', cursive" }}>נסה שוב</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <App />
    </StartupErrorBoundary>
  </React.StrictMode>,
)
