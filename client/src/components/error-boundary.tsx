import { Component, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-6" data-testid="error-boundary-fallback">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertTriangle className="h-10 w-10 mx-auto text-status-warning-foreground" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">
                  {this.props.fallbackMessage || "An unexpected error occurred while rendering this page."}
                </p>
              </div>
              {this.state.error && (
                <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-md text-left overflow-x-auto max-h-32">
                  {this.state.error.message}
                </pre>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button onClick={this.handleReset} data-testid="button-try-again">
                  Try Again
                </Button>
                <Button variant="outline" onClick={() => window.location.assign("/brief")} data-testid="button-go-home">
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
