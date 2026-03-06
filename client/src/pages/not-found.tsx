import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-404-title">
        Page Not Found
      </h1>
      <p className="text-muted-foreground max-w-md mb-6">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Button variant="outline" asChild data-testid="button-go-home">
        <a href="/" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </a>
      </Button>
    </div>
  );
}
