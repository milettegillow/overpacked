// Clerk components themed to the evening cabin palette.
export const clerkAppearance = {
  variables: {
    colorBackground: "#3D2E22",
    colorForeground: "#F1E6D2",
    colorMutedForeground: "#F1E6D2",
    colorPrimary: "#E3A94A",
    colorPrimaryForeground: "#2E2219",
    colorInput: "#2E2219",
    colorInputForeground: "#F1E6D2",
    colorNeutral: "#F1E6D2",
    borderRadius: "10px",
    fontFamily: "var(--font-bricolage), ui-sans-serif, system-ui, sans-serif",
    fontSize: "1rem",
  },
  elements: {
    card: { boxShadow: "none" },
    // Hides the "Secured by Clerk" branding strip below the card.
    footer: { display: "none" },
  },
};
