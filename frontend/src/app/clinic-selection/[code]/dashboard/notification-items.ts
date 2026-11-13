export interface NotificationItem {
  id: string;
  text: string;
  time: string;
}

/** Demo entries until the notification feed is connected. */
export function createInitialNotifications(): NotificationItem[] {
  return [
    {
      id: "n1",
      text: "Rahul K appointment booking is awaiting",
      time: "2 min ago",
    },
    {
      id: "n2",
      text: "Priya S appointment booking is awaiting",
      time: "15 min ago",
    },
    {
      id: "n3",
      text: "Arjun M appointment booking is awaiting",
      time: "1 hr ago",
    },
    {
      id: "n4",
      text: "Sneha R appointment booking is awaiting",
      time: "2 hr ago",
    },
    {
      id: "n5",
      text: "Maya S appointment booking is awaiting",
      time: "3 hr ago",
    },
    {
      id: "n6",
      text: "Nadia A appointment booking is awaiting",
      time: "4 hr ago",
    },
    {
      id: "n7",
      text: "Dev P appointment booking is awaiting",
      time: "5 hr ago",
    },
  ];
}
