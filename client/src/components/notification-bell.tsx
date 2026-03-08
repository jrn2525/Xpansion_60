import { Bell, AlertTriangle, Clock, BarChart3, FileText, CheckCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenantStore } from "@/lib/tenant-store";
import { useLocation } from "wouter";
import { useState } from "react";
import type { UserNotification } from "@shared/schema";

function getNotificationIcon(type: string) {
  switch (type) {
    case "alert":
      return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
    case "action_overdue":
      return <Clock className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--chart-4))" }} />;
    case "risk_escalation":
      return <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--chart-2))" }} />;
    case "digest_ready":
      return <FileText className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--chart-1))" }} />;
    case "report_ready":
      return <BarChart3 className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--chart-3))" }} />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

function timeAgo(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function NotificationBell() {
  const { activeTenantId } = useTenantStore();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ notifications: UserNotification[]; unreadCount: number }>({
    queryKey: [`/api/notifications?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
    refetchInterval: 30000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const notifQueryKey = [`/api/notifications?tenantId=${activeTenantId}`];

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifQueryKey });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all", { tenantId: activeTenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifQueryKey });
    },
  });

  function handleNotificationClick(notification: UserNotification) {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      setLocation(notification.link);
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative"
          data-testid="button-notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1"
              data-testid="badge-notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 p-3">
          <h4 className="text-sm font-semibold" data-testid="text-notifications-title">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`w-full text-left p-3 flex gap-3 hover-elevate transition-colors cursor-pointer ${
                    !notification.isRead ? "bg-muted/50" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-tight ${!notification.isRead ? "font-semibold" : ""}`}>
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70">
                      {notification.createdAt ? timeAgo(notification.createdAt) : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
