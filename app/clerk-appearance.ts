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
      // Our page heading replaces Clerk's on the first step only; later steps
      // (check your email, link opened, link expired) keep theirs.
      "&.cl-signIn-start .cl-header, &.cl-signUp-start .cl-header": { display: "none" },
      // Link-landing screens add a generic "You may close this tab" line that
      // repeats (or contradicts) the title and subtitle above it.
      "&.cl-signIn-emailLinkStatus .cl-verificationLinkStatusText, &.cl-signUp-emailLinkStatus .cl-verificationLinkStatusText":
        { display: "none" },
    },
    headerTitle: { fontSize: "24px", fontWeight: 500, color: CREAM },
    headerSubtitle: { fontSize: "16px", color: CREAM },
    formHeaderTitle: { fontSize: "16px", fontWeight: 500, color: CREAM },
    formHeaderSubtitle: { fontSize: "16px", color: CREAM },
    identityPreviewText: { fontSize: "16px", color: CREAM },
    identityPreviewEditButton: { color: MOSS },
    // Stays readable during the resend countdown; the "(59)" shows it's waiting.
    formResendCodeLink: { fontSize: "16px", color: MOSS, "&:disabled": { opacity: 1 } },
    verificationLinkStatusIcon: { color: AMBER },
    verificationLinkStatusText: { fontSize: "16px", color: CREAM },
    footerActionText: { fontSize: "16px", color: CREAM },
    footerActionLink: { fontSize: "16px", color: MOSS },
    spinner: { color: AMBER },
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

// Plain words for the sign-in flow. Sign-in and sign-up share the email-link
// screens' wording since it's one combined flow.
// Clerk doesn't fill in {{identifier}} on this step, but shows the address on
// its own line straight underneath.
const SENT = "We've sent you a link. If it's not in your inbox, check your junk folder.";
const CHECK_EMAIL = {
  title: "Check your email",
  subtitle: SENT,
  // The waiting step shows formSubtitle under the title.
  formSubtitle: SENT,
  resendButton: "Send it again",
};
const LOGGED_IN = "You're logged in";
const OTHER_TAB = "Head back to your other tab, or close this one";
const EXPIRED = { title: "That link's expired", subtitle: "Send a new one below" };

export const clerkLocalization = {
  formFieldLabel__emailAddress: "Email",
  formButtonPrimary: "Send link",
  formFieldError__verificationLinkExpired: "That link's expired - send a new one below",
  signIn: {
    emailLink: {
      ...CHECK_EMAIL,
      verified: { title: LOGGED_IN },
      verifiedSwitchTab: { title: LOGGED_IN, subtitle: OTHER_TAB, subtitleNewTab: OTHER_TAB },
      expired: EXPIRED,
      failed: EXPIRED,
    },
  },
  signUp: {
    emailLink: {
      ...CHECK_EMAIL,
      verified: { title: LOGGED_IN, subtitle: OTHER_TAB },
      verifiedSwitchTab: { titleNewTab: LOGGED_IN, subtitle: OTHER_TAB, subtitleNewTab: OTHER_TAB },
    },
  },
};
