; ZAX lowered .asm trace
; range: $0100..$016E (end exclusive)

; func write_pair begin
write_pair:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push HL                        ; 0108: E5
push AF                        ; 0109: F5
push BC                        ; 010A: C5
push DE                        ; 010B: D5
push HL                        ; 010C: E5
push DE                        ; 010D: D5
push IX                        ; 010E: DD E5
pop HL                         ; 0110: E1
ld DE, $0004                   ; 0111: 11 04 00
add HL, DE                     ; 0114: 19
push HL                        ; 0115: E5
pop DE                         ; 0116: D1
ld a, (hl)                     ; 0117: 7E
ld HL, pair_buf                ; 0118: 21 00 00
ld (hl), a                     ; 011B: 77
push DE                        ; 011C: D5
push IX                        ; 011D: DD E5
pop HL                         ; 011F: E1
ld DE, $0006                   ; 0120: 11 06 00
add HL, DE                     ; 0123: 19
push HL                        ; 0124: E5
pop DE                         ; 0125: D1
ld a, (hl)                     ; 0126: 7E
ld HL, pair_buf + 1            ; 0127: 21 00 00
ld (hl), a                     ; 012A: 77
__zax_epilogue_0:
pop HL                         ; 012B: E1
pop DE                         ; 012C: D1
pop BC                         ; 012D: C1
pop AF                         ; 012E: F1
ld SP, IX                      ; 012F: DD F9
pop IX                         ; 0131: DD E1
ret                            ; 0133: C9
; func read_pair_word begin
; func write_pair end
read_pair_word:
push AF                        ; 0134: F5
push BC                        ; 0135: C5
push DE                        ; 0136: D5
ld HL, pair_buf                ; 0137: 21 00 00
ld L, (hl)                     ; 013A: 6E
ld HL, pair_buf + 1            ; 013B: 21 00 00
ld H, (hl)                     ; 013E: 66
__zax_epilogue_1:
pop DE                         ; 013F: D1
pop BC                         ; 0140: C1
pop AF                         ; 0141: F1
ret                            ; 0142: C9
; func main begin
; func read_pair_word end
main:
push IX                        ; 0143: DD E5
ld IX, $0000                   ; 0145: DD 21 00 00
add IX, SP                     ; 0149: DD 39
push HL                        ; 014B: E5
push AF                        ; 014C: F5
push BC                        ; 014D: C5
push DE                        ; 014E: D5
push HL                        ; 014F: E5
ld HL, $0002                   ; 0150: 21 02 00
push HL                        ; 0153: E5
ld HL, $0001                   ; 0154: 21 01 00
push HL                        ; 0157: E5
call write_pair                ; 0158: CD 00 00
inc SP                         ; 015B: 33
inc SP                         ; 015C: 33
inc SP                         ; 015D: 33
inc SP                         ; 015E: 33
ld A, (pair_buf)               ; 015F: 3A 00 00
call read_pair_word            ; 0162: CD 00 00
__zax_epilogue_2:
pop HL                         ; 0165: E1
pop DE                         ; 0166: D1
pop BC                         ; 0167: C1
pop AF                         ; 0168: F1
ld SP, IX                      ; 0169: DD F9
pop IX                         ; 016B: DD E1
ret                            ; 016D: C9
; func main end

; symbols:
; label write_pair = $0100
; label __zax_epilogue_0 = $012B
; label read_pair_word = $0134
; label __zax_epilogue_1 = $013F
; label main = $0143
; label __zax_epilogue_2 = $0165
; var pair_buf = $016E
