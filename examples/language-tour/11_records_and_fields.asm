; ZAX lowered .asm trace
; range: $0100..$014E (end exclusive)

; func write_pair begin
write_pair:
ld HL, $0002                   ; 0100: 21 02 00
add HL, SP                     ; 0103: 39
ld a, (hl)                     ; 0104: 7E
ld HL, pair_buf                ; 0105: 21 00 00
ld (hl), a                     ; 0108: 77
ld HL, $0004                   ; 0109: 21 04 00
add HL, SP                     ; 010C: 39
ld a, (hl)                     ; 010D: 7E
ld HL, pair_buf + 1            ; 010E: 21 00 00
ld (hl), a                     ; 0111: 77
ret                            ; 0112: C9
; func read_pair_word begin
; func write_pair end
read_pair_word:
ld HL, pair_buf                ; 0113: 21 00 00
ld L, (hl)                     ; 0116: 6E
ld HL, pair_buf + 1            ; 0117: 21 00 00
ld H, (hl)                     ; 011A: 66
ret                            ; 011B: C9
; func main begin
; func read_pair_word end
main:
push AF                        ; 011C: F5
push BC                        ; 011D: C5
push DE                        ; 011E: D5
push IX                        ; 011F: DD E5
push IY                        ; 0121: FD E5
push HL                        ; 0123: E5
ld HL, $0002                   ; 0124: 21 02 00
push HL                        ; 0127: E5
ld HL, $0001                   ; 0128: 21 01 00
push HL                        ; 012B: E5
call write_pair                ; 012C: CD 00 00
pop BC                         ; 012F: C1
pop BC                         ; 0130: C1
pop HL                         ; 0131: E1
pop IY                         ; 0132: FD E1
pop IX                         ; 0134: DD E1
pop DE                         ; 0136: D1
pop BC                         ; 0137: C1
pop AF                         ; 0138: F1
ld A, (pair_buf)               ; 0139: 3A 00 00
push AF                        ; 013C: F5
push BC                        ; 013D: C5
push DE                        ; 013E: D5
push IX                        ; 013F: DD E5
push IY                        ; 0141: FD E5
call read_pair_word            ; 0143: CD 00 00
pop IY                         ; 0146: FD E1
pop IX                         ; 0148: DD E1
pop DE                         ; 014A: D1
pop BC                         ; 014B: C1
pop AF                         ; 014C: F1
ret                            ; 014D: C9
; func main end

; symbols:
; label write_pair = $0100
; label read_pair_word = $0113
; label main = $011C
; var pair_buf = $014E
