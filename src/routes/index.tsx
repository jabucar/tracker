import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

// The macro tracker is a standalone page served from /macros.html.
export const Route = createFileRoute("/")({
  component: Redirect,
});

function Redirect() {
  useEffect(() => {
    window.location.replace("/macros.html");
  }, []);
  return null;
}
