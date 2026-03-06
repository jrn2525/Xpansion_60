import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart3,
  Building2,
  TrendingUp,
  Shield,
  Zap,
  Target,
  ClipboardCheck,
  ArrowRight,
  KeyRound,
  Loader2,
} from "lucide-react";

const features = [
  {
    icon: Building2,
    title: "Multi-Tenant Operations",
    description:
      "Manage multiple franchise brands and locations from one command center with role-based access control.",
  },
  {
    icon: BarChart3,
    title: "Performance Metrics",
    description:
      "Define custom KPIs with configurable thresholds and bands. Track every location in real time.",
  },
  {
    icon: ClipboardCheck,
    title: "Weighted Scorecards",
    description:
      "Build scorecards from your metrics. Run scoring to get totals, bands, and per-metric breakdowns.",
  },
  {
    icon: TrendingUp,
    title: "Trend Intelligence",
    description:
      "Visualize performance trends with forecasting, anomaly detection, and confidence intervals.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description:
      "Tenant-scoped data isolation. Role-based access ensures the right people see the right data.",
  },
  {
    icon: Zap,
    title: "Automated Alerts",
    description:
      "Threshold-driven alerts with cooldown, escalation, and dedup workflows. Email and Slack delivery.",
  },
];

export default function LandingPage() {
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = "/";
      } else {
        setLoginError(data.error?.message || "Login failed");
      }
    } catch {
      setLoginError("Network error");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/90 border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              X
            </div>
            <span className="font-semibold text-lg tracking-tight" data-testid="text-landing-logo">
              Xpansion Console
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdminLogin(!showAdminLogin)} data-testid="button-admin-login">
              <KeyRound className="h-4 w-4 mr-1.5" />
              Admin
            </Button>
            <Button asChild data-testid="button-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </nav>

      {showAdminLogin && (
        <div className="fixed top-14 right-6 z-50 w-80">
          <Card className="shadow-lg border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-primary" />
                Admin Login
              </div>
              <form onSubmit={handleAdminLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email" className="text-xs">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                    data-testid="input-admin-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password" className="text-xs">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    data-testid="input-admin-password"
                  />
                </div>
                {loginError && (
                  <p className="text-xs text-status-error-foreground" data-testid="text-login-error">{loginError}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoggingIn} data-testid="button-admin-submit">
                  {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isLoggingIn ? "Signing in..." : "Sign In as Admin"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary">
              <Target className="h-3.5 w-3.5" />
              <span>Enterprise Franchise Management</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              Your franchise empire,{" "}
              <span className="text-primary">one command center.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Define metrics, set thresholds, build scorecards, and track
              performance trends across every location. Built for operators
              who demand visibility at scale.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login" className="gap-2">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#features">See Features</a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-6 pt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Multi-location ready</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Tenant-scoped</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Real-time alerts</span>
              </div>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="relative">
              <Card className="p-6 space-y-4">
                <CardContent className="p-0 space-y-4">
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
                      { label: "Revenue", score: 92 },
                      { label: "CSAT", score: 85 },
                      { label: "Food Cost", score: 78 },
                      { label: "Speed", score: 88 },
                    ].map((item, i) => (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1 text-sm">
                          <span>{item.label}</span>
                          <span className="font-medium">{item.score}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${item.score}%`, opacity: 1 - i * 0.15 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-xl bg-primary/5 border border-primary/10" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-6 border-t">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3 tracking-tight">
              Built for operators who demand results
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real-time visibility into performance across multiple brands and locations.
              No fluff. Just the data you need to act.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6 space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
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
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-bold">
              X
            </div>
            <span>Xpansion Console</span>
          </div>
          <span>Franchise Command Center</span>
        </div>
      </footer>
    </div>
  );
}
