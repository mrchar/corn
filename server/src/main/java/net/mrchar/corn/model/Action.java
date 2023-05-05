package net.mrchar.corn.model;


import jakarta.persistence.*;
import lombok.Getter;
import net.mrchar.corn.model.base.AuditableEntity;
import net.mrchar.corn.model.element.Label;

import java.util.Set;

@Getter
@Entity
@Table(name = "action")
public class Action extends AuditableEntity {
    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @ManyToOne
    @JoinColumn(name = "parent_id")
    private Action parent;

    @Column(name = "name")
    private String name;

    @ElementCollection
    @CollectionTable(name = "action_label")
    private Set<Label> labels;

    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    private Set<Action> children;
}
