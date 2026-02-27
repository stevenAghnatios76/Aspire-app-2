"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RsvpBreakdownChartProps {
  data: {
    attending: number;
    maybe: number;
    declined: number;
    upcoming: number;
  };
}

const COLORS = [
  "hsl(var(--chart-1))", // attending
  "hsl(var(--chart-2))", // maybe
  "hsl(var(--chart-3))", // declined
  "hsl(var(--chart-4))", // upcoming
];

const LABELS: Record<string, string> = {
  attending: "Attending",
  maybe: "Maybe",
  declined: "Declined",
  upcoming: "Upcoming",
};

export function RsvpBreakdownChart({ data }: RsvpBreakdownChartProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key] || key,
      value,
    }));

  const total = Object.values(data).reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">RSVP Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
          No RSVPs yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">RSVP Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.name}`}
                  fill={COLORS[Object.keys(LABELS).indexOf(
                    Object.entries(LABELS).find(([, v]) => v === entry.name)?.[0] || ""
                  ) % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
