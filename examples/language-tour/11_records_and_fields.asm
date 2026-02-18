; ZAX lowered .asm trace
; range: $0100..$0150 (end exclusive)

; func write_pair begin
write_pair:
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
ld a, (hl)                     ; 0112: 7E
ld HL, pair_buf                ; 0113: 21 00 00
ld (hl), a                     ; 0116: 77
push IX                        ; 0117: DD E5
pop HL                         ; 0119: E1
ld DE, $0006                   ; 011A: 11 06 00
add HL, DE                     ; 011D: 19
ld a, (hl)                     ; 011E: 7E
ld HL, pair_buf + 1            ; 011F: 21 00 00
ld (hl), a                     ; 0122: 77
pop DE                         ; 0123: D1
pop BC                         ; 0124: C1
pop AF                         ; 0125: F1
ld SP, IX                      ; 0126: DD F9
pop IX                         ; 0128: DD E1
ret                            ; 012A: C9
; func read_pair_word begin
; func write_pair end
read_pair_word:
push AF                        ; 012B: F5
push BC                        ; 012C: C5
push DE                        ; 012D: D5
ld HL, pair_buf                ; 012E: 21 00 00
ld L, (hl)                     ; 0131: 6E
ld HL, pair_buf + 1            ; 0132: 21 00 00
ld H, (hl)                     ; 0135: 66
pop DE                         ; 0136: D1
pop BC                         ; 0137: C1
pop AF                         ; 0138: F1
ret                            ; 0139: C9
; func main begin
; func read_pair_word end
main:
ld HL, $0002                   ; 013A: 21 02 00
push HL                        ; 013D: E5
ld HL, $0001                   ; 013E: 21 01 00
push HL                        ; 0141: E5
call write_pair                ; 0142: CD 00 00
inc SP                         ; 0145: 33
inc SP                         ; 0146: 33
inc SP                         ; 0147: 33
inc SP                         ; 0148: 33
ld A, (pair_buf)               ; 0149: 3A 00 00
call read_pair_word            ; 014C: CD 00 00
ret                            ; 014F: C9
; func main end

; symbols:
; label write_pair = $0100
; label read_pair_word = $012B
; label main = $013A
; var pair_buf = $0150
