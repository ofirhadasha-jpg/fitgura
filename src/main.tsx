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
      <View style={{ flex: 1, minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>משהו השתבש</Text>
        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20 }}>אירעה שגיאה בטעינת האפליקציה.</Text>
        <TouchableOpacity onPress={this.handleRecover} activeOpacity={0.8} style={{ backgroundColor: '#2E5BFF', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>נסה שוב</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <App />
    </StartupErrorBoundary>
  </React.StrictMode>,
)
