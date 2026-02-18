; ZAX lowered .asm trace
; range: $0100..$017A (end exclusive)

; func first_byte begin
first_byte:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld A, (bytes10)                ; 0103: 3A 00 00
pop DE                         ; 0106: D1
pop BC                         ; 0107: C1
pop AF                         ; 0108: F1
ret                            ; 0109: C9
; func first_byte end
; func read_word_at begin
read_word_at:
push IX                        ; 010A: DD E5
ld IX, $0000                   ; 010C: DD 21 00 00
add IX, SP                     ; 0110: DD 39
push AF                        ; 0112: F5
push BC                        ; 0113: C5
push DE                        ; 0114: D5
push IX                        ; 0115: DD E5
pop HL                         ; 0117: E1
ld DE, $0004                   ; 0118: 11 04 00
add HL, DE                     ; 011B: 19
push HL                        ; 011C: E5
pop HL                         ; 011D: E1
ld a, (hl)                     ; 011E: 7E
inc HL                         ; 011F: 23
ld h, (hl) ; ld l, a           ; 0120: 66 6F
push HL                        ; 0122: E5
pop HL                         ; 0123: E1
add HL, HL                     ; 0124: 29
push HL                        ; 0125: E5
ld HL, words4                  ; 0126: 21 00 00
pop DE                         ; 0129: D1
add HL, DE                     ; 012A: 19
push HL                        ; 012B: E5
pop HL                         ; 012C: E1
push AF                        ; 012D: F5
ld A, (HL)                     ; 012E: 7E
inc HL                         ; 012F: 23
ld H, (HL)                     ; 0130: 66
ld L, A                        ; 0131: 6F
pop AF                         ; 0132: F1
pop DE                         ; 0133: D1
pop BC                         ; 0134: C1
pop AF                         ; 0135: F1
ld SP, IX                      ; 0136: DD F9
pop IX                         ; 0138: DD E1
ret                            ; 013A: C9
; func main begin
; func read_word_at end
main:
push IX                        ; 013B: DD E5
ld IX, $0000                   ; 013D: DD 21 00 00
add IX, SP                     ; 0141: DD 39
ld HL, $0002                   ; 0143: 21 02 00
push HL                        ; 0146: E5
call first_byte                ; 0147: CD 00 00
push IX                        ; 014A: DD E5
pop HL                         ; 014C: E1
ld DE, $FFFE                   ; 014D: 11 FE FF
add HL, DE                     ; 0150: 19
push HL                        ; 0151: E5
pop HL                         ; 0152: E1
ld a, (hl)                     ; 0153: 7E
inc HL                         ; 0154: 23
ld h, (hl) ; ld l, a           ; 0155: 66 6F
push HL                        ; 0157: E5
call read_word_at              ; 0158: CD 00 00
inc SP                         ; 015B: 33
inc SP                         ; 015C: 33
ld SP, IX                      ; 015D: DD F9
pop IX                         ; 015F: DD E1
ret                            ; 0161: C9
; func main end

; symbols:
; label first_byte = $0100
; label read_word_at = $010A
; label main = $013B
; data bytes10 = $0162
; data words4 = $0172
