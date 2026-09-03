export function cleanKey(pemKey: string) {
    return pemKey
      .replace(/-----BEGIN [\w\s]+-----/, "")  
      .replace(/-----END [\w\s]+-----/, "")     
      .replace(/\r?\n|\r/g, "")
      .trim();
}