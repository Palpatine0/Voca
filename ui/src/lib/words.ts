// Capitalize each word without lowercasing acronyms or letters after apostrophes.
export function capitalizeWords(value: string): string {
  return value.replace(/\p{L}[\p{L}\p{M}\p{N}'’]*/gu,
    (word) => word.replace(/^\p{L}/u, (letter) => letter.toUpperCase()));
}
