; ZAX lowered .asm trace
; range: $0100..$015A (end exclusive)

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
push DE                        ; 010E: D5
ld DE, $0004                   ; 010F: 11 04 00
add HL, DE                     ; 0112: 19
pop DE                         ; 0113: D1
ld a, (hl)                     ; 0114: 7E
ld HL, pair_buf                ; 0115: 21 00 00
ld (hl), a                     ; 0118: 77
push IX                        ; 0119: DD E5
pop HL                         ; 011B: E1
push DE                        ; 011C: D5
ld DE, $0006                   ; 011D: 11 06 00
add HL, DE                     ; 0120: 19
pop DE                         ; 0121: D1
ld a, (hl)                     ; 0122: 7E
ld HL, pair_buf + 1            ; 0123: 21 00 00
ld (hl), a                     ; 0126: 77
__zax_epilogue_0:
pop DE                         ; 0127: D1
pop BC                         ; 0128: C1
pop AF                         ; 0129: F1
ld SP, IX                      ; 012A: DD F9
pop IX                         ; 012C: DD E1
ret                            ; 012E: C9
; func read_pair_word begin
; func write_pair end
read_pair_word:
push AF                        ; 012F: F5
push BC                        ; 0130: C5
push DE                        ; 0131: D5
ld HL, pair_buf                ; 0132: 21 00 00
ld L, (hl)                     ; 0135: 6E
ld HL, pair_buf + 1            ; 0136: 21 00 00
ld H, (hl)                     ; 0139: 66
__zax_epilogue_1:
pop DE                         ; 013A: D1
pop BC                         ; 013B: C1
pop AF                         ; 013C: F1
ret                            ; 013D: C9
; func main begin
; func read_pair_word end
main:
push AF                        ; 013E: F5
push BC                        ; 013F: C5
push DE                        ; 0140: D5
ld HL, $0002                   ; 0141: 21 02 00
push HL                        ; 0144: E5
ld HL, $0001                   ; 0145: 21 01 00
push HL                        ; 0148: E5
call write_pair                ; 0149: CD 00 00
inc SP                         ; 014C: 33
inc SP                         ; 014D: 33
inc SP                         ; 014E: 33
inc SP                         ; 014F: 33
ld A, (pair_buf)               ; 0150: 3A 00 00
call read_pair_word            ; 0153: CD 00 00
__zax_epilogue_2:
pop DE                         ; 0156: D1
pop BC                         ; 0157: C1
pop AF                         ; 0158: F1
ret                            ; 0159: C9
; func main end

; symbols:
; label write_pair = $0100
; label __zax_epilogue_0 = $0127
; label read_pair_word = $012F
; label __zax_epilogue_1 = $013A
; label main = $013E
; label __zax_epilogue_2 = $0156
; var pair_buf = $015A
