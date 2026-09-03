"use client";

import { useUserStore } from '@/stores/userStore';
import { useEffect } from 'react';

interface Props {
  initialUser: { name:string; userId: string; email: string } | null;
  children: React.ReactNode;
}

export default function UserProvider({ initialUser, children }: Props) {
  const setUser = useUserStore((s) => s.setUser);

  useEffect(() => {
    if (initialUser) {
      setUser(initialUser.name, initialUser.userId, initialUser.email);
    }
  }, [initialUser, setUser]);

  return <>{children}</>;
}
