; ZAX lowered .asm trace
; range: $0100..$0176 (end exclusive)

; func first_byte begin
first_byte:
ld A, (bytes10)                ; 0100: 3A 00 00
ret                            ; 0103: C9
; func first_byte end
; func read_word_at begin
read_word_at:
ld HL, $0002                   ; 0104: 21 02 00
add HL, SP                     ; 0107: 39
push HL                        ; 0108: E5
pop HL                         ; 0109: E1
ld a, (hl)                     ; 010A: 7E
inc HL                         ; 010B: 23
ld h, (hl) ; ld l, a           ; 010C: 66 6F
push HL                        ; 010E: E5
pop HL                         ; 010F: E1
add HL, HL                     ; 0110: 29
push HL                        ; 0111: E5
ld HL, words4                  ; 0112: 21 00 00
pop DE                         ; 0115: D1
add HL, DE                     ; 0116: 19
push HL                        ; 0117: E5
pop HL                         ; 0118: E1
push AF                        ; 0119: F5
ld A, (HL)                     ; 011A: 7E
inc HL                         ; 011B: 23
ld H, (HL)                     ; 011C: 66
ld L, A                        ; 011D: 6F
pop AF                         ; 011E: F1
ret                            ; 011F: C9
; func main begin
; func read_word_at end
main:
push BC                        ; 0120: C5
ld HL, $0002                   ; 0121: 21 02 00
add HL, SP                     ; 0124: 39
ld (HL), $0002                 ; 0125: 36 02
inc HL                         ; 0127: 23
ld (HL), $0000                 ; 0128: 36 00
push AF                        ; 012A: F5
push BC                        ; 012B: C5
push DE                        ; 012C: D5
push IX                        ; 012D: DD E5
push IY                        ; 012F: FD E5
call first_byte                ; 0131: CD 00 00
pop IY                         ; 0134: FD E1
pop IX                         ; 0136: DD E1
pop DE                         ; 0138: D1
pop BC                         ; 0139: C1
pop AF                         ; 013A: F1
push AF                        ; 013B: F5
push BC                        ; 013C: C5
push DE                        ; 013D: D5
push IX                        ; 013E: DD E5
push IY                        ; 0140: FD E5
ld HL, $000A                   ; 0142: 21 0A 00
add HL, SP                     ; 0145: 39
push HL                        ; 0146: E5
pop HL                         ; 0147: E1
ld a, (hl)                     ; 0148: 7E
inc HL                         ; 0149: 23
ld h, (hl) ; ld l, a           ; 014A: 66 6F
push HL                        ; 014C: E5
call read_word_at              ; 014D: CD 00 00
pop BC                         ; 0150: C1
pop IY                         ; 0151: FD E1
pop IX                         ; 0153: DD E1
pop DE                         ; 0155: D1
pop BC                         ; 0156: C1
pop AF                         ; 0157: F1
jp __zax_epilogue_2            ; 0158: C3 00 00
__zax_epilogue_2:
pop BC                         ; 015B: C1
ret                            ; 015C: C9
; func main end

; symbols:
; label first_byte = $0100
; label read_word_at = $0104
; label main = $0120
; label __zax_epilogue_2 = $015B
; data bytes10 = $015E
; data words4 = $016E
