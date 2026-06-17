/* eslint-disable react/prop-types */
import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Catches render-time exceptions in its subtree so a single bad value
 * (e.g. an out-of-range date) shows an inline message instead of blanking
 * the whole window. Reset via key change or the "Try again" button.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface to the DevTools console for debugging.
    console.error('ErrorBoundary caught a render error:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex items-center justify-center p-6 bg-bg-primary">
          <div className="max-w-lg w-full bg-bg-secondary border border-red-500/30 rounded-lg p-5 text-center">
            <div className="flex justify-center mb-3 text-red-400">
              <AlertTriangle size={28} />
            </div>
            <div className="text-text-primary font-medium mb-1">
              {this.props.title || 'Something went wrong rendering this view'}
            </div>
            <div className="text-xs text-text-secondary mb-3">
              A value in this result could not be displayed. The rest of the app is unaffected.
            </div>
            <pre className="text-[11px] text-red-400/90 bg-bg-tertiary border border-border rounded p-2 overflow-auto max-h-32 text-left font-mono whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={this.handleReset}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors"
            >
              <RotateCcw size={13} /> Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
