// Global type declarations for frontend

declare var QRCode: {
  new (element: HTMLElement, options: {
    text: string;
    width: number;
    height: number;
    colorDark: string;
    colorLight: string;
    correctLevel: any;
  }): any;
  CorrectLevel: {
    L: any;
    M: any;
    Q: any;
    H: any;
  };
};

// API Response types
interface BotApiResponse {
  message: string;
  online: boolean;
  qr?: string;
}