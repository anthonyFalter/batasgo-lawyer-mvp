declare module "mammoth" {
  type ConversionMessage = {
    type: "warning" | "error";
    message: string;
  };

  type ConversionResult = {
    value: string;
    messages: ConversionMessage[];
  };

  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConversionResult>;
  };

  export default mammoth;
}