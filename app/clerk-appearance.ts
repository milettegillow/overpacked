// Clerk's sign-in form themed to the evening cabin palette, sitting directly
// on the page rather than in a card of its own.

const CREAM = "#F1E6D2";
const MOSS = "#A9BC8C";
const RAISED = "#3D2E22";
const AMBER = "#E3A94A";
const WOOD = "#2E2219";

export const clerkAppearance = {
  variables: {
    colorPrimary: AMBER,
    colorPrimaryForeground: WOOD,
    colorForeground: CREAM,
    colorMutedForeground: MOSS,
    colorBackground: "transparent",
    colorInput: RAISED,
    colorInputForeground: CREAM,
    colorNeutral: CREAM,
    // Clerk draws input and button outlines and lifts with box-shadows built
    // from these; transparent keeps everything flat. Focus stays visible.
    colorBorder: "transparent",
    colorShadow: "transparent",
    colorRing: AMBER,
    borderRadius: "10px",
    fontFamily: "var(--font-bricolage), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-bricolage), ui-sans-serif, system-ui, sans-serif",
    fontSize: "16px",
  },
  options: {
    logoPlacement: "none" as const,
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      boxShadow: "none",
      border: "none",
      background: "transparent",
    },
    card: {
      background: "transparent",
      border: "none",
      boxShadow: "none",
      padding: 0,
    },
    // Our own heading replaces Clerk's title and subtitle.
    header: { display: "none" },
    formFieldLabel: { color: CREAM, fontSize: "16px", fontWeight: 400 },
    formFieldInput: {
      backgroundColor: RAISED,
      color: CREAM,
      border: "none",
      boxShadow: "none",
    },
    formButtonPrimary: {
      borderRadius: "9999px",
      backgroundColor: AMBER,
      backgroundImage: "none",
      color: WOOD,
      // Clerk's built-in lift shadows outrank plain values.
      boxShadow: "none !important",
      border: "none",
      fontSize: "16px",
      fontWeight: 500,
      textTransform: "none" as const,
      "&:hover, &:focus, &:active": { backgroundColor: AMBER, backgroundImage: "none" },
      // Clerk's sheen overlay.
      "&::after": { display: "none" },
      "&:focus-visible": { outline: `2px solid ${CREAM}`, outlineOffset: "2px" },
    },
    buttonArrowIcon: { display: "none" },
    socialButtonsBlockButton: {
      backgroundColor: RAISED,
      color: CREAM,
      border: "none",
      boxShadow: "none !important",
      "&:focus-visible": { outline: `2px solid ${AMBER}`, outlineOffset: "2px" },
      "&:hover": { backgroundColor: "#46352a" },
    },
    socialButtonsBlockButtonText: { color: CREAM, fontSize: "16px" },
    dividerLine: { backgroundColor: RAISED },
    dividerText: { color: MOSS, fontSize: "16px" },
    // Hides the "Don't have an account?" row and the "Secured by Clerk"
    // branding (sign-up is part of this one flow).
    footer: { display: "none" },
  },
};

// Plain words for the one form we show.
export const clerkLocalization = {
  formFieldLabel__emailAddress: "Email",
  formButtonPrimary: "Send link",
};
