import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3,
  Building2,
  TrendingUp,
  Shield,
  Zap,
  Target,
} from "lucide-react";

const features = [
  {
    icon: Building2,
    title: "Multi-Tenant Management",
    description:
      "Manage multiple franchise brands and locations from a single command center with role-based access control.",
  },
  {
    icon: BarChart3,
    title: "Metrics Engine",
    description:
      "Define custom KPIs with configurable thresholds and bands. Track performance across every location in real time.",
  },
  {
    icon: ClipboardCheck,
    title: "Scorecard System",
    description:
      "Build weighted scorecards from your metrics. Run scoring to get total scores, bands, and detailed breakdowns.",
  },
  {
    icon: TrendingUp,
    title: "Trend Analysis",
    description:
      "Visualize performance trends across months, quarters, half-years, and years with graceful gap handling.",
  },
  {
    icon: Shield,
    title: "Tenant-Scoped Security",
    description:
      "Every data point is scoped to its tenant. Role-based access ensures the right people see the right data.",
  },
  {
    icon: Zap,
    title: "Actionable Insights",
    description:
      "Threshold-driven alerts and performance bands make it clear where to focus improvement efforts.",
  },
];

import { ClipboardCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              F
            </div>
            <span className="font-semibold text-lg" data-testid="text-landing-logo">
              Franchise OS
            </span>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Sign In</a>
          </Button>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight font-serif">
              Your franchise empire,{" "}
              <span className="text-primary">one command center.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Define metrics, set thresholds, build scorecards, and track
              performance trends across every location. Franchise OS gives
              operators the visibility they need to scale with confidence.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login">Get Started</a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#features">See Features</a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                <span>Multi-location ready</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 text-primary" />
                <span>Tenant-scoped</span>
              </div>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="relative">
              <div className="rounded-xl bg-card border p-6 space-y-4">
                <div className="flex items-center justify-between gap-1">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    <p className="text-3xl font-bold">87.5</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium">
                    Good
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Revenue", score: 92, color: "bg-chart-1" },
                    { label: "CSAT", score: 85, color: "bg-chart-2" },
                    { label: "Food Cost", score: 78, color: "bg-chart-4" },
                    { label: "Speed", score: 88, color: "bg-chart-3" },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1 text-sm">
                        <span>{item.label}</span>
                        <span className="font-medium">{item.score}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-xl bg-primary/5 border" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-6 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold font-serif mb-3">
              Everything you need to operate at scale
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built for franchise operators who need real-time visibility into
              performance across multiple brands and locations.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-background">
                <CardContent className="p-6 space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1 text-sm text-muted-foreground">
          <span>Franchise OS Command Center</span>
          <span>Phase 1</span>
        </div>
      </footer>
    </div>
  );
}
