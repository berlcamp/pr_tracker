"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrackForm() {
  const [rs, setRs] = useState("");
  const router = useRouter();
  return (
    <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (rs.trim()) router.push(`/track/${encodeURIComponent(rs.trim().toUpperCase())}`); }}>
      <Input aria-label="Routing slip number" placeholder="RS-2026-10-00001" value={rs} onChange={(e) => setRs(e.target.value)} />
      <Button type="submit">Track</Button>
    </form>
  );
}
