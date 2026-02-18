; ZAX lowered .asm trace
; range: $0100..$0188 (end exclusive)

; func read_byte_at begin
read_byte_at:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
push IX                        ; 010B: DD E5
pop HL                         ; 010D: E1
ld DE, $0004                   ; 010E: 11 04 00
add HL, DE                     ; 0111: 19
push HL                        ; 0112: E5
pop HL                         ; 0113: E1
ld a, (hl)                     ; 0114: 7E
inc HL                         ; 0115: 23
ld h, (hl) ; ld l, a           ; 0116: 66 6F
push HL                        ; 0118: E5
pop HL                         ; 0119: E1
push HL                        ; 011A: E5
ld HL, sample_bytes            ; 011B: 21 00 00
pop DE                         ; 011E: D1
add HL, DE                     ; 011F: 19
push HL                        ; 0120: E5
pop HL                         ; 0121: E1
ld A, (hl)                     ; 0122: 7E
pop DE                         ; 0123: D1
pop BC                         ; 0124: C1
pop AF                         ; 0125: F1
ld SP, IX                      ; 0126: DD F9
pop IX                         ; 0128: DD E1
ret                            ; 012A: C9
; func read_byte_at end
; func read_word_at begin
read_word_at:
push IX                        ; 012B: DD E5
ld IX, $0000                   ; 012D: DD 21 00 00
add IX, SP                     ; 0131: DD 39
push AF                        ; 0133: F5
push BC                        ; 0134: C5
push DE                        ; 0135: D5
push IX                        ; 0136: DD E5
pop HL                         ; 0138: E1
ld DE, $0004                   ; 0139: 11 04 00
add HL, DE                     ; 013C: 19
push HL                        ; 013D: E5
pop HL                         ; 013E: E1
ld a, (hl)                     ; 013F: 7E
inc HL                         ; 0140: 23
ld h, (hl) ; ld l, a           ; 0141: 66 6F
push HL                        ; 0143: E5
pop HL                         ; 0144: E1
add HL, HL                     ; 0145: 29
push HL                        ; 0146: E5
ld HL, sample_words            ; 0147: 21 00 00
pop DE                         ; 014A: D1
add HL, DE                     ; 014B: 19
push HL                        ; 014C: E5
pop HL                         ; 014D: E1
push AF                        ; 014E: F5
ld A, (HL)                     ; 014F: 7E
inc HL                         ; 0150: 23
ld H, (HL)                     ; 0151: 66
ld L, A                        ; 0152: 6F
pop AF                         ; 0153: F1
pop DE                         ; 0154: D1
pop BC                         ; 0155: C1
pop AF                         ; 0156: F1
ld SP, IX                      ; 0157: DD F9
pop IX                         ; 0159: DD E1
ret                            ; 015B: C9
; func main begin
; func read_word_at end
main:
ld HL, $0003                   ; 015C: 21 03 00
push HL                        ; 015F: E5
call read_byte_at              ; 0160: CD 00 00
inc SP                         ; 0163: 33
inc SP                         ; 0164: 33
ld HL, $0001                   ; 0165: 21 01 00
push HL                        ; 0168: E5
call read_word_at              ; 0169: CD 00 00
inc SP                         ; 016C: 33
inc SP                         ; 016D: 33
ret                            ; 016E: C9
; func main end

; symbols:
; label read_byte_at = $0100
; label read_word_at = $012B
; label main = $015C
; data sample_bytes = $0170
; data sample_words = $0180
