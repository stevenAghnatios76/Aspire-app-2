"use client";

import {
  CalendarPlus,
  CheckCircle2,
  Mail,
  Search,
  BarChart3,
  UserCog,
  Shield,
  Sparkles,
  Bot,
  Mic,
  Brain,
  Clock,
  FileText,
  Users,
  AlertTriangle,
  Star,
  ListChecks,
  TrendingUp,
  PieChart,
  Activity,
  Tag,
  FileBarChart,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface FeatureItem {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  description: string;
  howToUse: string[];
  location: string;
}

const coreFeatures: FeatureItem[] = [
  {
    icon: <CalendarPlus className="h-5 w-5 text-blue-500" />,
    title: "Event CRUD",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Create, view, edit, and delete events with full details including title, date/time, location, description, tags, capacity, and virtual meeting support.",
    howToUse: [
      "Go to Events page and click 'Create Event' to make a new event",
      "Click on any event card to view its full details",
      "Use the Edit button on an event detail page to modify it",
      "Delete events from the event detail page (owner only)",
    ],
    location: "/events, /events/create, /events/[id]",
  },
  {
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    title: "RSVP & Status Tracking",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Track attendance with RSVP statuses: Attending, Maybe, Declined, and Upcoming. Capacity enforcement prevents over-booking.",
    howToUse: [
      "Open any event you are invited to",
      "Click the RSVP button and choose your status",
      "Your response is tracked and visible to the event organizer",
      "Capacity limits are automatically enforced",
    ],
    location: "/events/[id]",
  },
  {
    icon: <Mail className="h-5 w-5 text-purple-500" />,
    title: "Invitations",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Send email invitations to attendees, manage incoming invitations, and respond via token-based links directly from email.",
    howToUse: [
      "On an event detail page, click 'Invite' to send invitations by email",
      "Go to Invitations page to see all your pending invitations",
      "Accept or decline invitations from the Invitations page",
      "External users can respond via the link in their invitation email",
    ],
    location: "/invitations, /events/[id]",
  },
  {
    icon: <Search className="h-5 w-5 text-orange-500" />,
    title: "Search & Filters",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Search events by keyword, date range, location, tags, RSVP status, and virtual/in-person filter.",
    howToUse: [
      "Use the search bar on the Events page",
      "Apply filters for date range, location, tags, and more",
      "Combine multiple filters to narrow down results",
      "Results update in real-time as you type or change filters",
    ],
    location: "/events",
  },
  {
    icon: <BarChart3 className="h-5 w-5 text-teal-500" />,
    title: "Dashboard & Analytics",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Visual dashboard with stat cards, trend charts, RSVP breakdowns, attendance rates, and top tags analytics.",
    howToUse: [
      "Click 'Dashboard' in the navigation bar",
      "View stat cards at the top for quick overview",
      "Scroll down to see trend charts and analytics",
      "Use the time period selector to change the date range",
    ],
    location: "/dashboard",
  },
  {
    icon: <UserCog className="h-5 w-5 text-gray-500" />,
    title: "User Settings",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Update your profile including display name and profile picture. Manage your account preferences.",
    howToUse: [
      "Click your avatar in the top-right corner of the header",
      "Select 'Settings' from the dropdown menu",
      "Edit your display name and save changes",
    ],
    location: "/settings",
  },
  {
    icon: <Shield className="h-5 w-5 text-red-500" />,
    title: "Authentication",
    badge: "Core",
    badgeVariant: "outline",
    description:
      "Secure sign-in with Email/Password, Google OAuth, or GitHub OAuth. All dashboard pages are protected behind authentication.",
    howToUse: [
      "Visit the app to see the login page",
      "Choose Email/Password, Google, or GitHub sign-in",
      "New users can register via the Register page",
      "You'll be automatically redirected to login if not authenticated",
    ],
    location: "/login, /register",
  },
];

const aiFeatures: FeatureItem[] = [
  {
    icon: <Clock className="h-5 w-5 text-blue-500" />,
    title: "Smart Scheduling",
    badge: "AI",
    badgeVariant: "secondary",
    description:
      "AI suggests 3 optimal time slots for your event based on attendee availability and scheduling patterns.",
    howToUse: [
      "Go to Events → Create Event",
      "Click the 'Suggest best time' button",
      "Review the 3 AI-suggested time slots",
      "Click on a suggestion to auto-fill the date/time fields",
    ],
    location: "/events/create",
  },
  {
    icon: <FileText className="h-5 w-5 text-green-500" />,
    title: "AI Description Generator",
    badge: "AI",
    badgeVariant: "secondary",
    description:
      "Automatically generate polished event descriptions in different tones: professional, casual, fun, or formal.",
    howToUse: [
      "On the event create/edit form, look for the 'AI Generate' button next to the description field",
      "Enter a brief topic or keywords for your event",
      "Choose a tone (professional, casual, fun, formal)",
      "Click generate and the AI will write a full description",
      "Edit the generated text as needed before saving",
    ],
    location: "/events/create, /events/[id]/edit",
  },
  {
    icon: <Search className="h-5 w-5 text-purple-500" />,
    title: "NLP Smart Search",
    badge: "AI",
    badgeVariant: "secondary",
    description:
      "Search events using natural language queries like 'team meetings next week' or 'virtual events about marketing'. AI translates your words into precise filters.",
    howToUse: [
      "On the Events page, use the NLP search bar",
      "Type a natural language query (e.g., 'outdoor events this month')",
      "The AI parses your query into structured search filters",
      "Results appear instantly based on the AI interpretation",
    ],
    location: "/events",
  },
  {
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    title: "Conflict Detection",
    badge: "AI",
    badgeVariant: "secondary",
    description:
      "Automatically detects scheduling conflicts when you pick a date and suggests resolutions like rescheduling, shortening, or skipping.",
    howToUse: [
      "When creating or editing an event, select a date and time",
      "The AI automatically checks for conflicts (debounced)",
      "If conflicts are found, an alert appears with details",
      "Review suggested resolutions: reschedule, shorten, or skip",
    ],
    location: "/events/create, /events/[id]/edit",
  },
  {
    icon: <Users className="h-5 w-5 text-teal-500" />,
    title: "Attendee Recommendations",
    badge: "AI",
    badgeVariant: "secondary",
    description:
      "AI suggests people to invite based on past attendance patterns, shared interests, and event similarity.",
    howToUse: [
      "Open an event detail page",
      "Click 'Invite' to open the invitation modal",
      "Click 'Suggest people' to get AI recommendations",
      "Review suggested attendees with relevance scores",
      "Select and invite recommended people",
    ],
    location: "/events/[id]",
  },
];

const advancedAiFeatures: FeatureItem[] = [
  {
    icon: <FileBarChart className="h-5 w-5 text-blue-500" />,
    title: "Post-Event Recap Generator",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "Generate comprehensive post-event recaps with attendance analytics, highlights, follow-up actions, and shareable summary text.",
    howToUse: [
      "Navigate to a past event that you organized",
      "Click the 'Generate Recap' button",
      "AI analyzes attendance data and generates a full recap",
      "View highlights, analytics, and follow-up items",
      "Copy the shareable text to send to attendees",
    ],
    location: "/events/[id] (past events, owner only)",
  },
  {
    icon: <Star className="h-5 w-5 text-yellow-500" />,
    title: "Personalized Event Recommendations",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "Get an 'Events For You' row showing personalized event recommendations based on your RSVP history and interests.",
    howToUse: [
      "Go to the Events page",
      "Look for the 'Events For You' section at the top",
      "Recommendations are based on your past RSVP patterns",
      "Click on any recommended event to view its details",
    ],
    location: "/events",
  },
  {
    icon: <ListChecks className="h-5 w-5 text-green-500" />,
    title: "AI Agenda Builder",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "Automatically generate structured, time-blocked agendas for your events based on duration, topic, and goals.",
    howToUse: [
      "On the event create or edit page, click 'Build Agenda'",
      "Enter the event topic and goals",
      "AI generates a time-blocked agenda with activities",
      "Edit, reorder, or customize agenda items as needed",
      "Save the agenda as part of the event",
    ],
    location: "/events/create, /events/[id]/edit",
  },
  {
    icon: <Brain className="h-5 w-5 text-purple-500" />,
    title: "Attendance Prediction",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "AI predicts expected turnout for your event and provides capacity advice based on historical attendance patterns.",
    howToUse: [
      "View the prediction card on any event detail page",
      "See the predicted number of attendees vs. capacity",
      "Get advice on whether to increase or decrease capacity",
      "On the create form, see an inline prediction hint",
    ],
    location: "/events/[id], /events/create",
  },
  {
    icon: <Mic className="h-5 w-5 text-red-500" />,
    title: "Voice-to-Event Creator",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "Create events using voice commands or natural text input. Speak or type a description and the AI extracts all event details automatically.",
    howToUse: [
      "On the Events page, click the 'Voice' button in the header",
      "A side panel (sheet) opens with a microphone",
      "Click the mic icon and speak your event details",
      "Or type a natural description in the text box",
      "AI extracts title, date, time, location, and description",
      "Review and confirm to create the event",
    ],
    location: "/events",
  },
  {
    icon: <Bot className="h-5 w-5 text-teal-500" />,
    title: "AI Event Assistant",
    badge: "Advanced AI",
    badgeVariant: "default",
    description:
      "A multi-turn chat assistant available on every page. Ask it to create events, check your schedule, invite people, build agendas, search events, and more.",
    howToUse: [
      "Look for the floating chat button in the bottom-right corner",
      "Click it to open the AI assistant chat panel",
      "Type natural language commands or questions",
      "Examples: 'Create a team meeting tomorrow at 3pm'",
      "The assistant can perform actions and answer questions about your events",
    ],
    location: "Available on all dashboard pages (bottom-right FAB)",
  },
];

const dashboardWidgets: FeatureItem[] = [
  {
    icon: <BarChart3 className="h-5 w-5 text-blue-500" />,
    title: "Stat Cards",
    badge: "Dashboard",
    badgeVariant: "outline",
    description:
      "Quick overview cards showing total events, attending count, pending invitations, and declined count at a glance.",
    howToUse: [
      "Navigate to the Dashboard page",
      "View the 4 stat cards at the top of the page",
      "Numbers update automatically as your data changes",
    ],
    location: "/dashboard",
  },
  {
    icon: <TrendingUp className="h-5 w-5 text-green-500" />,
    title: "Events Trend Chart",
    badge: "Dashboard",
    badgeVariant: "outline",
    description:
      "Line chart showing the trend of events created over time, helping you visualize activity patterns.",
    howToUse: [
      "Go to Dashboard and scroll to the charts section",
      "View the Events Trend line chart",
      "Hover over data points for exact values",
    ],
    location: "/dashboard",
  },
  {
    icon: <PieChart className="h-5 w-5 text-purple-500" />,
    title: "RSVP Breakdown Chart",
    badge: "Dashboard",
    badgeVariant: "outline",
    description:
      "Pie/donut chart showing the distribution of RSVP responses across all your events (Attending, Maybe, Declined).",
    howToUse: [
      "Go to Dashboard and find the RSVP Breakdown chart",
      "View the color-coded segments for each response type",
      "Hover for percentages and exact numbers",
    ],
    location: "/dashboard",
  },
  {
    icon: <Activity className="h-5 w-5 text-teal-500" />,
    title: "Attendance Rate Chart",
    badge: "Dashboard",
    badgeVariant: "outline",
    description:
      "Track your overall attendance rate over time, showing how consistently people attend your events.",
    howToUse: [
      "Go to Dashboard and find the Attendance Rate chart",
      "View the attendance percentage trend over time",
      "Use this to understand engagement patterns",
    ],
    location: "/dashboard",
  },
  {
    icon: <Tag className="h-5 w-5 text-orange-500" />,
    title: "Top Tags Chart",
    badge: "Dashboard",
    badgeVariant: "outline",
    description:
      "Bar chart showing the most popular tags used across your events, highlighting trending topics and categories.",
    howToUse: [
      "Go to Dashboard and find the Top Tags chart",
      "View which tags are most frequently used",
      "Use insights to tag future events effectively",
    ],
    location: "/dashboard",
  },
  {
    icon: <Sparkles className="h-5 w-5 text-yellow-500" />,
    title: "AI Weekly Summary",
    badge: "AI + Dashboard",
    badgeVariant: "secondary",
    description:
      "AI-generated weekly summary of your event activity, upcoming schedule, and personalized insights.",
    howToUse: [
      "Go to Dashboard and look for the Weekly Summary section",
      "AI automatically generates a summary of your week",
      "Includes upcoming events, activity recap, and tips",
      "Refreshes weekly with new insights",
    ],
    location: "/dashboard",
  },
];

function FeatureCard({ feature }: { feature: FeatureItem }) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {feature.icon}
            <CardTitle className="text-base">{feature.title}</CardTitle>
          </div>
          {feature.badge && (
            <Badge variant={feature.badgeVariant}>{feature.badge}</Badge>
          )}
        </div>
        <CardDescription className="mt-2">
          {feature.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Separator className="mb-3" />
        <div>
          <p className="text-sm font-medium mb-2">How to use:</p>
          <ol className="list-decimal list-inside space-y-1">
            {feature.howToUse.map((step, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Location:
          </span>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {feature.location}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InfoPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-500" />
            App Features & Guide
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you can do with Event Scheduler — organized by category
            with step-by-step instructions.
          </p>
        </div>
      </div>

      <Separator />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {coreFeatures.length}
            </p>
            <p className="text-xs text-muted-foreground">Core Features</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {aiFeatures.length}
            </p>
            <p className="text-xs text-muted-foreground">AI Features</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {advancedAiFeatures.length}
            </p>
            <p className="text-xs text-muted-foreground">Advanced AI</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {dashboardWidgets.length}
            </p>
            <p className="text-xs text-muted-foreground">Dashboard Widgets</p>
          </CardContent>
        </Card>
      </div>

      {/* Feature Tabs */}
      <Tabs defaultValue="core" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="core">Core</TabsTrigger>
          <TabsTrigger value="ai">AI Features</TabsTrigger>
          <TabsTrigger value="advanced">Advanced AI</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="core" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {coreFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <div className="mb-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              These features are powered by Google Gemini AI and work
              automatically to help you plan better events.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {aiFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Advanced AI features use sophisticated analysis of your event
              history and patterns to provide deeper insights and automation.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {advancedAiFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {dashboardWidgets.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
