import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { reportUrl } from './report';

interface Props {
  /** Where the crash happened, e.g. "the charts" — completes "Something went wrong in …". */
  label: string;
  /** Changing this (e.g. to the new log's id) clears a previous crash. */
  resetKey?: string;
  children: ReactNode;
}

/** Contains a rendering crash to one area of the app instead of blanking the whole page. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Render error in ${this.props.label}`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm"
      >
        <p className="font-medium">Something went wrong in {this.props.label}.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={reportUrl('render-error')} target="_blank" rel="noreferrer">
              Report
            </a>
          </Button>
        </div>
      </div>
    );
  }
}
