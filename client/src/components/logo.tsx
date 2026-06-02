import { useTheme } from "@/components/theme-provider";
import logoDark from "@assets/XConsole_transparent.png";
import logoLight from "@assets/XConsole_light_transparent.png";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  const { theme } = useTheme();
  const src = theme === "dark" ? logoDark : logoLight;

  return (
    <img
      src={src}
      alt="Xpansion 60"
      className={className}
      data-testid="logo"
    />
  );
}
