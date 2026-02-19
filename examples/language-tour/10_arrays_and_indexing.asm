; ZAX lowered .asm trace
; range: $0100..$0184 (end exclusive)

; func first_byte begin
first_byte:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld A, (bytes10)                ; 0103: 3A 00 00
__zax_epilogue_0:
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
push DE                        ; 0115: D5
push IX                        ; 0116: DD E5
pop HL                         ; 0118: E1
ld DE, $0004                   ; 0119: 11 04 00
add HL, DE                     ; 011C: 19
pop DE                         ; 011D: D1
push HL                        ; 011E: E5
pop HL                         ; 011F: E1
ld a, (hl)                     ; 0120: 7E
inc HL                         ; 0121: 23
ld h, (hl) ; ld l, a           ; 0122: 66 6F
push HL                        ; 0124: E5
pop HL                         ; 0125: E1
add HL, HL                     ; 0126: 29
push HL                        ; 0127: E5
ld HL, words4                  ; 0128: 21 00 00
pop DE                         ; 012B: D1
add HL, DE                     ; 012C: 19
push HL                        ; 012D: E5
pop HL                         ; 012E: E1
push AF                        ; 012F: F5
ld A, (HL)                     ; 0130: 7E
inc HL                         ; 0131: 23
ld H, (HL)                     ; 0132: 66
ld L, A                        ; 0133: 6F
pop AF                         ; 0134: F1
__zax_epilogue_1:
pop DE                         ; 0135: D1
pop BC                         ; 0136: C1
pop AF                         ; 0137: F1
ld SP, IX                      ; 0138: DD F9
pop IX                         ; 013A: DD E1
ret                            ; 013C: C9
; func main begin
; func read_word_at end
main:
push IX                        ; 013D: DD E5
ld IX, $0000                   ; 013F: DD 21 00 00
add IX, SP                     ; 0143: DD 39
push AF                        ; 0145: F5
push BC                        ; 0146: C5
push DE                        ; 0147: D5
ld HL, $0002                   ; 0148: 21 02 00
push HL                        ; 014B: E5
call first_byte                ; 014C: CD 00 00
push DE                        ; 014F: D5
push IX                        ; 0150: DD E5
pop HL                         ; 0152: E1
ld DE, $FFF8                   ; 0153: 11 F8 FF
add HL, DE                     ; 0156: 19
pop DE                         ; 0157: D1
push HL                        ; 0158: E5
pop HL                         ; 0159: E1
ld a, (hl)                     ; 015A: 7E
inc HL                         ; 015B: 23
ld h, (hl) ; ld l, a           ; 015C: 66 6F
push HL                        ; 015E: E5
call read_word_at              ; 015F: CD 00 00
inc SP                         ; 0162: 33
inc SP                         ; 0163: 33
__zax_epilogue_2:
pop DE                         ; 0164: D1
pop BC                         ; 0165: C1
pop AF                         ; 0166: F1
ld SP, IX                      ; 0167: DD F9
pop IX                         ; 0169: DD E1
ret                            ; 016B: C9
; func main end

; symbols:
; label first_byte = $0100
; label __zax_epilogue_0 = $0106
; label read_word_at = $010A
; label __zax_epilogue_1 = $0135
; label main = $013D
; label __zax_epilogue_2 = $0164
; data bytes10 = $016C
; data words4 = $017C
